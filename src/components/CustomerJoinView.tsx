import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  QrCode,
  ShieldAlert,
  Ticket,
  Users,
} from 'lucide-react';
import { PublicQueueState, PublicTicketState } from '../types/queue.ts';
import { useQueueChannel } from '../hooks/useQueueChannel.ts';

interface CustomerJoinViewProps {
  slug: string;
  qrToken: string;
  onNavigateToTicket: (ticketId: string) => void;
}

function getOrCreateDeviceId(): string {
  const key = 'pilaph_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id =
      'dev-' +
      Math.random().toString(36).substring(2, 11) +
      '-' +
      Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return (
    'idem-' +
    Math.random().toString(36).substring(2, 12) +
    '-' +
    Date.now().toString(36)
  );
}

export const CustomerJoinView: React.FC<CustomerJoinViewProps> = ({
  slug,
  qrToken,
  onNavigateToTicket,
}) => {
  const [queueState, setQueueState] = useState<
    (PublicQueueState & { qrTokenValid?: boolean }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active ticket check from localStorage
  const [existingTicket, setExistingTicket] =
    useState<PublicTicketState | null>(null);

  // Form fields
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(
    null
  );
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Tracks the photo URL that failed to load, so a newly uploaded photo is retried.
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);

  // Idempotency key generated once per form session
  const idempotencyKey = useMemo(() => generateUuidV4(), []);

  const fetchQueueState = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/q/${encodeURIComponent(slug)}/state?k=${encodeURIComponent(
          qrToken || ''
        )}`
      );
      if (!res.ok) {
        throw new Error('Could not load shop queue.');
      }
      const data = await res.json();
      setQueueState(data);
      setSelectedServiceId((prev) => {
        if (prev) return prev;
        const firstActive = data.services?.find(
          (s: { isActive: boolean; id: number }) => s.isActive
        );
        return firstActive ? firstActive.id : null;
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Unable to load queue details.'
      );
    } finally {
      setLoading(false);
    }
  }, [slug, qrToken]);

  // Check if customer already has an active ticket saved in localStorage
  useEffect(() => {
    const savedTicketId = localStorage.getItem(`pilaph_active_ticket_${slug}`);
    if (!savedTicketId) return;

    fetch(`/api/t/${encodeURIComponent(savedTicketId)}/state`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t: PublicTicketState | null) => {
        if (t && (t.status === 'waiting' || t.status === 'called')) {
          setExistingTicket(t);
        } else {
          localStorage.removeItem(`pilaph_active_ticket_${slug}`);
        }
      })
      .catch(() => {
        // Ignore stale local ticket
      });
  }, [slug]);

  useEffect(() => {
    fetchQueueState();
  }, [fetchQueueState]);

  // Subscribe to live public queue events
  useQueueChannel({
    businessId: queueState?.business.id ?? null,
    onQueueEvent: () => {
      fetchQueueState();
    },
    onReconnectOrVisible: fetchQueueState,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !selectedServiceId) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const deviceId = getOrCreateDeviceId();
      const res = await fetch(`/api/q/${encodeURIComponent(slug)}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrToken,
          serviceId: selectedServiceId,
          customerName: customerName.trim(),
          phone: phone.trim() || null,
          idempotencyKey,
          deviceId,
          website: honeypot,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Could not join the queue.');
        setSubmitting(false);
        return;
      }

      if (data.ticket?.id) {
        localStorage.setItem(`pilaph_active_ticket_${slug}`, data.ticket.id);
        onNavigateToTicket(data.ticket.id);
      }
    } catch {
      setSubmitError('Network error while joining the queue. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
        <div className="h-44 rounded-2xl bg-slate-200 animate-pulse" />
        <div className="h-24 rounded-2xl bg-slate-200 animate-pulse" />
        <div className="h-64 rounded-2xl bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (error || !queueState) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center space-y-3">
          <ShieldAlert className="w-8 h-8 text-red-600 mx-auto" />
          <h2 className="text-lg font-semibold text-slate-900">
            Shop Queue Unavailable
          </h2>
          <p className="text-sm text-slate-600">
            {error || 'We could not find this shop.'}
          </p>
        </div>
      </div>
    );
  }

  const { business, services, nowServing, waitingCount, qrTokenValid } =
    queueState;
  const activeServices = services.filter((s) => s.isActive);
  const selectedService = activeServices.find(
    (s) => s.id === selectedServiceId
  );

  const canJoin =
    Boolean(qrTokenValid) &&
    business.isOpen &&
    !business.isPastCutoff &&
    !business.isFull &&
    activeServices.length > 0;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-16 space-y-6">
      {/* Shop Header Card with Editorial Hero */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="relative h-40 w-full bg-slate-900">
          {business.photoUrl && failedPhotoUrl !== business.photoUrl ? (
            <img
              src={business.photoUrl}
              alt={business.name}
              referrerPolicy="no-referrer"
              onError={() => setFailedPhotoUrl(business.photoUrl)}
              className="w-full h-full object-cover opacity-85"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-800" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
          <div className="absolute bottom-4 left-5 right-5 text-white">
            <div className="text-xs text-slate-300 flex items-center gap-2">
              <span>{business.isOpen ? 'Queue Open' : 'Queue Paused'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Manila {business.manilaTime}
              </span>
              {business.joinCutoffTime && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Cutoff {business.joinCutoffTime}</span>
                </>
              )}
            </div>
            <h1 className="text-xl font-bold tracking-tight mt-0.5 text-balance">
              {business.name}
            </h1>
          </div>
        </div>

        {/* Live Wait Estimate Before Joining */}
        <div className="p-5 grid grid-cols-2 gap-4 divide-x divide-slate-200 bg-white">
          <div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>Waiting in Line</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {waitingCount}
              </span>
              <span className="text-xs text-slate-500">
                { business.maxWaiting
                  ? `of ${business.maxWaiting} max`
                  : 'customers'}
              </span>
            </div>
          </div>

          <div className="pl-4">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Estimated Wait Now</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
                {selectedService
                  ? selectedService.estimatedWaitRange
                  : queueState.estimatedNewJoinRange}
              </span>
            </div>
          </div>
        </div>

        {/* Live Now Serving Strip */}
        {nowServing.length > 0 && (
          <div className="border-t border-slate-200 px-5 py-3 bg-slate-50 flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-500 shrink-0">
              Now Serving:
            </span>
            <div className="flex items-center gap-3 overflow-x-auto font-mono tabular-nums text-slate-800">
              {nowServing.map((ns, idx) => (
                <React.Fragment key={ns.counterId}>
                  {idx > 0 && (
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                  )}
                  <span className="whitespace-nowrap">
                    <span className="text-slate-500 font-sans">
                      {ns.counterName.split('—')[0].trim()}:
                    </span>{' '}
                    <strong className="text-slate-900">
                      {ns.ticketCode || 'Idle'}
                    </strong>
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Existing Active Ticket Reminder Banner (When scanning QR again) */}
      {existingTicket && (
        <div className="rounded-2xl border border-emerald-600/30 bg-emerald-50/70 p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-900">
                Active Ticket Found on Your Phone
              </p>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                You already have ticket{' '}
                <span className="font-mono tabular-nums text-emerald-800">
                  {existingTicket.code}
                </span>
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                {existingTicket.status === 'called'
                  ? `Now called to ${existingTicket.counterName || 'Counter'}`
                  : `Position #${existingTicket.position || 1} · Estimated wait ${
                      existingTicket.etaRange || '5–10 min'
                    }`}
              </p>
            </div>
            <Ticket className="w-6 h-6 text-emerald-700 shrink-0" />
          </div>
          <button
            type="button"
            onClick={() => onNavigateToTicket(existingTicket.id)}
            className="w-full min-h-[48px] rounded-xl bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-emerald-800 transition-colors"
          >
            <span>Open Ticket {existingTicket.code}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Missing or Expired QR Token Gate */}
      {!qrTokenValid && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <QrCode className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-amber-950">
                Scan the QR code at the shop
              </h2>
              <p className="text-xs text-amber-900 leading-relaxed">
                To prevent remote spam tickets, joining requires scanning the
                live QR code poster displayed inside {business.name}.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Paused / Cutoff / Capacity Warnings */}
      {qrTokenValid && !business.isOpen && (
        <div className="rounded-2xl border border-slate-300 bg-white p-5 text-center space-y-1.5">
          <h3 className="text-base font-semibold text-slate-900">
            Queue is Paused
          </h3>
          <p className="text-xs text-slate-600">
            The shop owner has temporarily paused new queue joins. Please check
            back shortly.
          </p>
        </div>
      )}

      {qrTokenValid && business.isOpen && business.isFull && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center space-y-1.5">
          <h3 className="text-base font-semibold text-red-950">
            Queue is full, please try again later
          </h3>
          <p className="text-xs text-red-800">
            All {business.maxWaiting} waiting slots are currently occupied.
          </p>
        </div>
      )}

      {qrTokenValid && business.isOpen && business.isPastCutoff && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center space-y-1.5">
          <h3 className="text-base font-semibold text-amber-950">
            Queue Closed for Today
          </h3>
          <p className="text-xs text-amber-800">
            Walk-in joins close after {business.joinCutoffTime} Manila time.
          </p>
        </div>
      )}

      {/* Join Queue Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            1. Select Service
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Choose the service you need today to see your ticket prefix and
            estimated wait.
          </p>

          <div className="mt-3 space-y-2.5">
            {activeServices.length === 0 && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                {business.name} hasn&apos;t added any services yet, so the
                queue can&apos;t take new tickets.
              </p>
            )}
            {activeServices.map((svc) => {
              const isSelected = svc.id === selectedServiceId;
              return (
                <button
                  key={svc.id}
                  type="button"
                  onClick={() => setSelectedServiceId(svc.id)}
                  className={`w-full text-left rounded-xl p-4 border transition-colors min-h-[64px] flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span
                      className={`w-10 h-10 rounded-lg font-mono font-bold text-base flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-white/15 text-white'
                          : 'bg-slate-100 text-slate-900'
                      }`}
                    >
                      {svc.prefix}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {svc.name}
                      </div>
                      <div
                        className={`text-xs mt-0.5 flex items-center gap-1.5 ${
                          isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        <span className="font-mono tabular-nums">
                          ~{svc.avgMinutes} min service
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Wait {svc.estimatedWaitRange}
                        </span>
                      </div>
                    </div>
                  </div>
                  <CheckCircle2
                    className={`w-5 h-5 shrink-0 ${
                      isSelected ? 'text-emerald-400' : 'text-slate-200'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            2. Your Details
          </h2>

          <div>
            <label
              htmlFor="customerName"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Your Name <span className="text-red-600">*</span>
            </label>
            <input
              id="customerName"
              type="text"
              required
              maxLength={60}
              placeholder="e.g. Ana Santos"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="customerPhone"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Mobile Number for SMS Turn Alerts{' '}
              <span className="font-normal text-slate-400">(Optional)</span>
            </label>
            <input
              id="customerPhone"
              type="tel"
              placeholder="0917 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              We send at most two SMS updates via Semaphore: when{' '}
              <span className="font-mono tabular-nums">
                {business.nearThreshold}
              </span>{' '}
              people are ahead of you, and when your number is called.
            </p>
          </div>

          {/* Hidden Honeypot Input for Spam Protection */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor="website_hp">Website</label>
            <input
              id="website_hp"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>
        </div>

        {submitError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={!canJoin || submitting || !customerName.trim()}
          className="w-full min-h-[52px] rounded-xl bg-slate-900 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {submitting ? (
            <span>Issuing Your Ticket...</span>
          ) : (
            <>
              <Ticket className="w-4 h-4" />
              <span>Get Queue Ticket Now</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
