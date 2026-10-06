import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  Send,
  ShieldCheck,
  Smartphone,
  Terminal,
} from 'lucide-react';
import {
  Business,
  CounterItem,
  DashboardState,
  SmsType,
  TicketItem,
} from '../types/queue.ts';
import {
  formatPhoneForDisplay,
  isValidPhilippinePhone,
  normalizePhilippinePhone,
} from '../actions/PhoneNormalizer.ts';

interface SmsSimulatorCardProps {
  business: Business;
  counters: CounterItem[];
  tickets: TicketItem[];
  authHeaders: () => Record<string, string>;
  onDashboardUpdated: (nextDashboard: DashboardState) => void;
}

interface SimulationResult {
  ok: boolean;
  skippedByGuard?: boolean;
  reason?: string;
  ticketCode?: string;
  semaphorePayload?: {
    endpoint: string;
    driver: string;
    sendername: string;
    number: string;
    message: string;
    segments: number;
    status: string;
    providerResponse: string;
  };
  timestamp: string;
}

export const SmsSimulatorCard: React.FC<SmsSimulatorCardProps> = ({
  business,
  counters,
  tickets,
  authHeaders,
  onDashboardUpdated,
}) => {
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const [smsType, setSmsType] = useState<SmsType>('near');
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [selectedCounterName, setSelectedCounterName] = useState<string>('');
  const [aheadCount, setAheadCount] = useState<number>(2);
  const [enforceDuplicateGuard, setEnforceDuplicateGuard] =
    useState<boolean>(false);
  const [useCustomMessage, setUseCustomMessage] = useState<boolean>(false);
  const [customMessage, setCustomMessage] = useState<string>('');

  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SimulationResult | null>(null);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) || tickets[0] || null,
    [tickets, selectedTicketId]
  );

  // Sync default selections when tickets or counters change
  useEffect(() => {
    if (!selectedTicketId && tickets.length > 0) {
      setSelectedTicketId(tickets[0].id);
    }
  }, [tickets, selectedTicketId]);

  useEffect(() => {
    if (selectedTicket) {
      setPhoneInput(selectedTicket.phone || '0917 889 2311');
      if (
        selectedTicket.position !== null &&
        selectedTicket.position !== undefined
      ) {
        setAheadCount(Math.max(0, selectedTicket.position - 1));
      } else {
        setAheadCount(Math.max(1, business.nearThreshold - 1));
      }
      if (selectedTicket.counterName) {
        setSelectedCounterName(selectedTicket.counterName);
      } else if (counters.length > 0 && !selectedCounterName) {
        setSelectedCounterName(counters[0].name);
      }
    }
  }, [selectedTicket, business.nearThreshold, counters, selectedCounterName]);

  const normalizedRecipient = useMemo(
    () => normalizePhilippinePhone(phoneInput),
    [phoneInput]
  );

  const previewMessage = useMemo(() => {
    if (useCustomMessage && customMessage.trim()) {
      return customMessage.trim();
    }
    if (!selectedTicket) {
      return 'Select a ticket to preview the Semaphore SMS message.';
    }
    const firstName =
      selectedTicket.customerName.trim().split(/\s+/)[0] || 'Customer';
    const ticketUrl = `${window.location.origin}/t/${selectedTicket.id}`;
    const peopleWord = aheadCount === 1 ? 'person' : 'people';
    const counterLabel =
      selectedCounterName || counters[0]?.name || 'Counter 1';

    if (smsType === 'near') {
      return `Hi ${firstName}, ${aheadCount} ${peopleWord} ahead of you at ${business.name} (${selectedTicket.code}). Track live: ${ticketUrl}`;
    }
    return `${selectedTicket.code}, please proceed to ${counterLabel} at ${business.name}. Ticket: ${ticketUrl}`;
  }, [
    useCustomMessage,
    customMessage,
    selectedTicket,
    aheadCount,
    selectedCounterName,
    counters,
    smsType,
    business.name,
  ]);

  const charCount = previewMessage.length;
  const segmentCount = Math.max(1, Math.ceil(charCount / 160));

  const alreadySentForType = useMemo(() => {
    if (!selectedTicket) return null;
    return smsType === 'near'
      ? selectedTicket.nearSmsSentAt
      : selectedTicket.calledSmsSentAt;
  }, [selectedTicket, smsType]);

  const handleSimulateSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || !selectedTicket) return;

    setError(null);
    if (!phoneInput.trim() || !isValidPhilippinePhone(phoneInput)) {
      setError(
        'Enter a valid Philippine mobile number (e.g. 0917 123 4567 or 639171234567).'
      );
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/dashboard/sms/simulate', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          type: smsType,
          phone: phoneInput.trim(),
          counterName:
            selectedCounterName || counters[0]?.name || 'Counter 1',
          aheadCount: Number(aheadCount),
          enforceDuplicateGuard,
          customMessage: useCustomMessage ? customMessage.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (data.dashboard) {
        onDashboardUpdated(data.dashboard);
      }

      if (!res.ok && !data.skippedByGuard) {
        setError(data.error || 'Failed to trigger test SMS.');
      } else {
        setLastResult({
          ok: Boolean(data.ok),
          skippedByGuard: Boolean(data.skippedByGuard),
          reason: data.reason,
          ticketCode: selectedTicket.code,
          semaphorePayload: data.semaphorePayload,
          timestamp: new Date().toLocaleTimeString('en-PH', {
            timeZone: 'Asia/Manila',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        });
      }
    } catch {
      setError('Network error while triggering test SMS notification.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Smartphone className="w-5 h-5 text-slate-900 shrink-0" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Semaphore SMS Simulator
            </h2>
            <p className="text-xs text-slate-500">
              Manually trigger and verify &ldquo;Near Turn&rdquo; or
              &ldquo;Called to Counter&rdquo; SMS dispatches for any ticket
              before moving to live production
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-mono tabular-nums flex items-center gap-2">
          <span>Gateway: Semaphore PH v4</span>
          <span aria-hidden="true">·</span>
          <span>Sender: PILAPH</span>
        </div>
      </div>

      {/* Body Grid */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form Controls (7 cols) */}
        <form
          onSubmit={handleSimulateSms}
          className="lg:col-span-7 space-y-4"
        >
          {/* 1. Target Ticket Selector */}
          <div>
            <label
              htmlFor="sim-ticket-select"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              1. Target Queue Ticket
            </label>
            {tickets.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-500">
                No tickets in today&apos;s queue yet. Create a ticket to test SMS
                notifications.
              </div>
            ) : (
              <select
                id="sim-ticket-select"
                value={selectedTicket?.id || ''}
                onChange={(e) => setSelectedTicketId(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {tickets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.customerName} ({t.status.toUpperCase()} ·{' '}
                    {t.phone ? formatPhoneForDisplay(t.phone) : 'No phone'})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 2. Notification Type Segmented Control */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">
              2. Notification Event Type
            </span>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setSmsType('near')}
                className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  smsType === 'near'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Near-Turn Alert (Position ≤ {business.nearThreshold})
              </button>
              <button
                type="button"
                onClick={() => setSmsType('called')}
                className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  smsType === 'called'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Called to Counter Alert
              </button>
            </div>
          </div>

          {/* 3. Recipient Phone + Contextual Parameter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="sim-phone-input"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Recipient Mobile Number (PH)
              </label>
              <input
                id="sim-phone-input"
                type="tel"
                required
                placeholder="0917 123 4567"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
              />
              <div className="mt-1 text-[11px] text-slate-500 font-mono tabular-nums">
                Normalized:{' '}
                <strong
                  className={
                    normalizedRecipient ? 'text-emerald-700' : 'text-red-600'
                  }
                >
                  {normalizedRecipient || 'Invalid PH format'}
                </strong>
              </div>
            </div>

            {smsType === 'near' ? (
              <div>
                <label
                  htmlFor="sim-ahead-input"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  People Ahead Count in Template
                </label>
                <input
                  id="sim-ahead-input"
                  type="number"
                  min={0}
                  max={50}
                  value={aheadCount}
                  onChange={(e) =>
                    setAheadCount(Math.max(0, Number(e.target.value)))
                  }
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Shop near_threshold is {business.nearThreshold}
                </div>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="sim-counter-select"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Assigned Counter / Chair Name
                </label>
                <select
                  id="sim-counter-select"
                  value={selectedCounterName}
                  onChange={(e) => setSelectedCounterName(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {counters.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 4. Duplicate Guard Verification Toggle & Custom Message Override */}
          <div className="space-y-2.5 pt-1 border-t border-slate-100">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={enforceDuplicateGuard}
                onChange={(e) => setEnforceDuplicateGuard(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-slate-900"
              />
              <span className="text-xs text-slate-700 leading-relaxed">
                <strong>
                  Enforce production duplicate guard (
                  <code className="font-mono">
                    {smsType === 'near'
                      ? 'near_sms_sent_at'
                      : 'called_sms_sent_at'}
                  </code>
                  ):
                </strong>{' '}
                When checked, blocks sending if this ticket already received a{' '}
                {smsType} SMS today
                {alreadySentForType ? ' (currently marked SENT)' : ' (currently NULL)'}
                . Leave unchecked to force a test dispatch.
              </span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomMessage}
                onChange={(e) => {
                  setUseCustomMessage(e.target.checked);
                  if (e.target.checked && !customMessage) {
                    setCustomMessage(previewMessage);
                  }
                }}
                className="w-4 h-4 rounded border-slate-300 text-slate-900"
              />
              <span className="text-xs text-slate-700">
                Customize SMS message text before sending
              </span>
            </label>

            {useCustomMessage && (
              <textarea
                rows={2}
                maxLength={320}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={sending || !selectedTicket || !normalizedRecipient}
            className="w-full min-h-[48px] rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4 text-emerald-400" />
            <span>
              {sending
                ? 'Dispatching Test SMS...'
                : `Trigger Test "${
                    smsType === 'near' ? 'Near Turn' : 'Called'
                  }" SMS for ${selectedTicket?.code || 'Ticket'}`}
            </span>
          </button>
        </form>

        {/* Right Live SMS Handset Preview & Semaphore API Payload Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Simulated Customer Handset Bubble */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>SMS Handset Preview</span>
              </div>
              <span className="font-mono tabular-nums">
                {charCount} chars · {segmentCount} SMS segment
                {segmentCount > 1 ? 's' : ''}
              </span>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-3.5 text-xs text-slate-800 leading-relaxed shadow-2xs">
              <div className="text-[11px] font-mono text-slate-400 mb-1">
                From: PILAPH · To:{' '}
                {normalizedRecipient
                  ? formatPhoneForDisplay(normalizedRecipient)
                  : 'Invalid number'}
              </div>
              <p className="break-words">{previewMessage}</p>
            </div>
          </div>

          {/* Last Dispatch Verification Result */}
          {lastResult ? (
            <div
              className={`rounded-2xl border p-4 space-y-3 text-xs ${
                lastResult.skippedByGuard
                  ? 'border-amber-300 bg-amber-50 text-amber-950'
                  : 'border-emerald-300 bg-emerald-50/70 text-slate-900'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 font-bold">
                  {lastResult.skippedByGuard ? (
                    <>
                      <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>Duplicate Guard Verified (Blocked)</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>
                        Test SMS Dispatched ({lastResult.ticketCode})
                      </span>
                    </>
                  )}
                </div>
                <span className="font-mono tabular-nums text-[11px] text-slate-500">
                  {lastResult.timestamp}
                </span>
              </div>

              {lastResult.skippedByGuard ? (
                <p className="text-xs text-amber-900 leading-relaxed">
                  {lastResult.reason}
                </p>
              ) : (
                lastResult.semaphorePayload && (
                  <div className="rounded-xl bg-slate-900 text-slate-100 p-3 font-mono text-[11px] space-y-1 overflow-x-auto">
                    <div className="text-slate-400 flex items-center gap-1.5 pb-1 border-b border-slate-800">
                      <Terminal className="w-3 h-3 text-emerald-400" />
                      <span>POST {lastResult.semaphorePayload.endpoint}</span>
                    </div>
                    <div>
                      driver:{' '}
                      <span className="text-emerald-400">
                        {lastResult.semaphorePayload.driver}
                      </span>{' '}
                      · status:{' '}
                      <span className="text-emerald-400">
                        {lastResult.semaphorePayload.status}
                      </span>
                    </div>
                    <div>
                      number: &quot;{lastResult.semaphorePayload.number}&quot; ·
                      sender: &quot;{lastResult.semaphorePayload.sendername}
                      &quot;
                    </div>
                    <div className="text-slate-400 truncate">
                      response: {lastResult.semaphorePayload.providerResponse}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 space-y-1">
              <div className="font-semibold text-slate-800">
                Ready for Verification
              </div>
              <p className="leading-relaxed">
                Select any ticket on the left and click{' '}
                <strong>Trigger Test SMS</strong> to inspect the Semaphore API
                request payload and record a verified entry in{' '}
                <code className="font-mono">sms_logs</code>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
