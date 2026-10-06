import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Clock,
  MessageSquare,
  RefreshCw,
  Users,
  XCircle,
} from 'lucide-react';
import { PublicTicketState } from '../types/queue.ts';
import {
  RealtimeQueueEvent,
  RealtimeTicketEvent,
  useQueueChannel,
} from '../hooks/useQueueChannel.ts';
function formatEtaRange(etaMinutes: number): string {
  if (etaMinutes <= 3) return '2–5 min';
  const low = Math.max(2, Math.floor((etaMinutes * 0.85) / 5) * 5);
  const high = Math.max(low + 5, Math.ceil((etaMinutes * 1.15) / 5) * 5);
  return `${low}–${high} min`;
}

interface CustomerTicketViewProps {
  ticketId: string;
  onBackToJoin: (slug: string) => void;
}

export const CustomerTicketView: React.FC<CustomerTicketViewProps> = ({
  ticketId,
  onBackToJoin,
}) => {
  const [ticket, setTicket] = useState<PublicTicketState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const fetchTicketState = useCallback(async () => {
    try {
      const res = await fetch(`/api/t/${encodeURIComponent(ticketId)}/state`);
      if (!res.ok) {
        throw new Error('Ticket not found.');
      }
      const data: PublicTicketState = await res.json();
      setTicket(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Unable to load your ticket.'
      );
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchTicketState();
  }, [fetchTicketState]);

  // Real-time design rule:
  // Public broadcasts include the ordered list of waiting ticket codes (`waiting_codes`),
  // so each customer page computes its own position locally without hitting the server on every event!
  const handleQueueBroadcast = useCallback((evt: RealtimeQueueEvent) => {
    setTicket((prev) => {
      if (!prev) return prev;
      const { waiting_codes, now_serving, code, counter, status } = evt.payload;

      // Check if our own ticket was called or updated in this queue event
      let nextStatus = prev.status;
      let nextCounterName = prev.counterName;

      if (code === prev.code) {
        if (status === 'called') {
          nextStatus = 'called';
          nextCounterName = counter || prev.counterName;
        } else if (
          status === 'done' ||
          status === 'no_show' ||
          status === 'cancelled'
        ) {
          nextStatus = status;
        }
      }

      if (nextStatus !== 'waiting') {
        return {
          ...prev,
          status: nextStatus,
          counterName: nextCounterName,
          position: null,
          aheadCount: 0,
          nowServing: now_serving || prev.nowServing,
          waitingCodes: waiting_codes || prev.waitingCodes,
        };
      }

      // Compute position locally from `waiting_codes`!
      const idx = (waiting_codes || []).indexOf(prev.code);
      if (idx === -1) {
        return {
          ...prev,
          nowServing: now_serving || prev.nowServing,
          waitingCodes: waiting_codes || prev.waitingCodes,
        };
      }

      const newPosition = idx + 1;
      const newAhead = Math.max(0, newPosition - 1);
      const activeCounters = Math.max(1, (now_serving || []).length);
      const perTicketMins =
        prev.position && prev.etaMinutes
          ? Math.max(5, Math.round((prev.etaMinutes * activeCounters) / prev.position))
          : 15;
      const nextEtaMinutes = Math.ceil(
        (newPosition * perTicketMins) / activeCounters
      );

      return {
        ...prev,
        position: newPosition,
        aheadCount: newAhead,
        etaMinutes: nextEtaMinutes,
        etaRange: formatEtaRange(nextEtaMinutes),
        nowServing: now_serving || prev.nowServing,
        waitingCodes: waiting_codes || prev.waitingCodes,
      };
    });
  }, []);

  const handleTicketBroadcast = useCallback((evt: RealtimeTicketEvent) => {
    setTicket((prev) => {
      if (!prev) return prev;
      const nextStatus = evt.payload.status as PublicTicketState['status'];
      return {
        ...prev,
        status: nextStatus,
        counterName: evt.payload.counter || prev.counterName,
        position: nextStatus === 'waiting' ? prev.position : null,
        aheadCount: nextStatus === 'waiting' ? prev.aheadCount : 0,
      };
    });
  }, []);

  const { connected } = useQueueChannel({
    businessId: ticket?.business.id ?? null,
    ticketUuid: ticketId,
    onQueueEvent: handleQueueBroadcast,
    onTicketEvent: handleTicketBroadcast,
    onReconnectOrVisible: fetchTicketState,
  });

  const handleCancelTicket = async () => {
    if (cancelling || !ticket) return;
    setCancelling(true);
    try {
      const res = await fetch(
        `/api/t/${encodeURIComponent(ticket.id)}/cancel`,
        {
          method: 'POST',
        }
      );
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
        setConfirmCancel(false);
        localStorage.removeItem(`pilaph_active_ticket_${ticket.business.slug}`);
      }
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 space-y-4">
        <div className="h-80 rounded-2xl bg-slate-200 animate-pulse" />
        <div className="h-32 rounded-2xl bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center space-y-4">
          <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
          <h2 className="text-lg font-semibold text-slate-900">
            Ticket Not Found
          </h2>
          <p className="text-xs text-slate-600">
            This ticket link may have expired or does not exist. Scan the QR
            code at the shop to join the queue.
          </p>
        </div>
      </div>
    );
  }

  const isCalled = ticket.status === 'called';
  const isWaiting = ticket.status === 'waiting';
  const isNearTurn =
    isWaiting &&
    ticket.position !== null &&
    ticket.position <= ticket.business.nearThreshold;

  return (
    <div className="max-w-md mx-auto px-4 py-6 pb-16 space-y-5">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between text-xs text-slate-600">
        <button
          type="button"
          onClick={() => onBackToJoin(ticket.business.slug)}
          className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-slate-900 min-h-[40px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{ticket.business.name}</span>
        </button>

        <div className="flex items-center gap-2">
          <span>{connected ? 'Live updates active' : 'Syncing'}</span>
          <button
            type="button"
            onClick={fetchTicketState}
            title="Refresh ticket"
            className="p-2 rounded-lg hover:bg-slate-200/70 text-slate-600 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Physical Perforated Ticket Stub Card */}
      <div
        className={`rounded-3xl border overflow-hidden transition-colors ${
          isCalled
            ? 'border-emerald-600 bg-emerald-950 text-white'
            : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        {/* Top Banner Status */}
        <div
          className={`px-6 py-3.5 border-b flex items-center justify-between text-xs font-semibold ${
            isCalled
              ? 'border-emerald-800 bg-emerald-900 text-emerald-100'
              : isNearTurn
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-slate-100 bg-slate-50 text-slate-600'
          }`}
        >
          <span>
            {isCalled
              ? 'YOUR TURN — NOW SERVING'
              : isNearTurn
                ? 'ALMOST YOUR TURN — STAY NEARBY'
                : ticket.status === 'done'
                  ? 'COMPLETED'
                  : ticket.status === 'cancelled'
                    ? 'CANCELLED'
                    : ticket.status === 'no_show'
                      ? 'MARKED NO-SHOW'
                      : 'WAITING IN QUEUE'}
          </span>
          <span className="font-mono tabular-nums">{ticket.serviceName}</span>
        </div>

        {/* Center Ticket Code */}
        <div className="px-6 py-8 text-center space-y-2">
          <div
            className={`text-xs font-medium ${
              isCalled ? 'text-emerald-300' : 'text-slate-500'
            }`}
          >
            Your Queue Ticket Number
          </div>
          <div className="text-6xl font-bold font-mono tabular-nums tracking-tight">
            {ticket.code}
          </div>

          {isCalled && (
            <div className="pt-3">
              <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 text-slate-950 px-5 py-2.5 text-sm font-bold">
                <BellRing className="w-4 h-4" />
                <span>
                  Proceed to {ticket.counterName || 'Assigned Counter'}
                </span>
              </div>
            </div>
          )}

          {ticket.status === 'done' && (
            <div className="pt-2 flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <span>Thank you for visiting {ticket.business.name}</span>
            </div>
          )}

          {(ticket.status === 'cancelled' || ticket.status === 'no_show') && (
            <div className="pt-2 flex items-center justify-center gap-1.5 text-sm font-medium text-red-600">
              <XCircle className="w-4 h-4" />
              <span>
                {ticket.status === 'cancelled'
                  ? 'You cancelled this ticket.'
                  : 'You were marked as a no-show.'}
              </span>
            </div>
          )}
        </div>

        {/* Perforated Tear Divider */}
        {isWaiting && (
          <>
            <div className="relative flex items-center justify-between px-2">
              <div className="w-5 h-5 rounded-full bg-[#F8FAFC] border border-slate-200 -ml-4" />
              <div className="flex-1 border-t-2 border-dashed border-slate-200 my-1" />
              <div className="w-5 h-5 rounded-full bg-[#F8FAFC] border border-slate-200 -mr-4" />
            </div>

            {/* Position & Estimated Wait Grid */}
            <div className="p-6 grid grid-cols-2 gap-4 divide-x divide-slate-200">
              <div>
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>Your Position</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                    #{ticket.position ?? 1}
                  </span>
                  <span className="text-xs text-slate-500 font-mono tabular-nums">
                    ({ticket.aheadCount} ahead)
                  </span>
                </div>
              </div>

              <div className="pl-4">
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Estimated Wait</span>
                </div>
                <div className="mt-1">
                  <span className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
                    {ticket.etaRange || '5–10 min'}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* SMS Alert Footnote */}
        <div
          className={`px-6 py-3.5 border-t text-xs flex items-center justify-between gap-2 ${
            isCalled
              ? 'border-emerald-800 bg-emerald-900/50 text-emerald-200'
              : 'border-slate-100 bg-slate-50 text-slate-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span>
              {ticket.hasPhone
                ? ticket.calledSmsSent
                  ? 'SMS alert sent: Called to counter'
                  : ticket.nearSmsSent
                    ? 'SMS alert sent: Almost your turn'
                    : 'SMS turn notifications enabled'
                : 'No SMS number linked — keep this page open'}
            </span>
          </div>
        </div>
      </div>

      {/* Live Counter Board */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-900">
            Now Serving at {ticket.business.name}
          </h3>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {ticket.waitingCodes.length} waiting
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {ticket.nowServing.map((ns) => (
            <div
              key={ns.counterId}
              className="py-2.5 flex items-center justify-between text-sm"
            >
              <span className="text-slate-600">{ns.counterName}</span>
              <span
                className={`font-mono tabular-nums font-bold ${
                  ns.ticketCode === ticket.code
                    ? 'text-emerald-700'
                    : ns.ticketCode
                      ? 'text-slate-900'
                      : 'text-slate-400 font-normal'
                }`}
              >
                {ns.ticketCode || 'Available'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Cancel Ticket Control */}
      {(isWaiting || isCalled) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {!confirmCancel ? (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="w-full min-h-[44px] rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold transition-colors"
            >
              Cancel My Ticket ({ticket.code})
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-700 font-medium text-center">
                Are you sure you want to leave the queue and cancel{' '}
                <strong className="font-mono">{ticket.code}</strong>?
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="min-h-[44px] rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  Keep My Spot
                </button>
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={handleCancelTicket}
                  className="min-h-[44px] rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling...' : 'Yes, Cancel Ticket'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
