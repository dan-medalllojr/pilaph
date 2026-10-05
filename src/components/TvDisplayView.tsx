import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Wifi } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PublicQueueState } from '../types/queue.ts';
import {
  RealtimeQueueEvent,
  useQueueChannel,
} from '../hooks/useQueueChannel.ts';

interface TvDisplayViewProps {
  slug: string;
  fallbackQrToken?: string;
}

function playAirportChimeAndSpeak(
  enabled: boolean,
  code: string | null,
  counter: string | null
) {
  if (!enabled) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Two-tone chime (E5 -> C5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.45);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(523.25, now + 0.25);
      gain2.gain.setValueAtTime(0.22, now + 0.25);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.25);
      osc2.stop(now + 0.9);
    }

    if ('speechSynthesis' in window && code) {
      window.speechSynthesis.cancel();
      const spokenCode = code.replace('-', ' ');
      const cleanCounter = counter ? counter.split('—')[0].trim() : 'the counter';
      const utterance = new SpeechSynthesisUtterance(
        `Ticket ${spokenCode}, please proceed to ${cleanCounter}.`
      );
      utterance.rate = 0.92;
      window.speechSynthesis.speak(utterance);
    }
  } catch {
    // Ignore browser autoplay audio restrictions
  }
}

export const TvDisplayView: React.FC<TvDisplayViewProps> = ({
  slug,
  fallbackQrToken,
}) => {
  const [state, setState] = useState<PublicQueueState | null>(null);
  const [highlightedCode, setHighlightedCode] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const soundRef = useRef(soundEnabled);

  useEffect(() => {
    soundRef.current = soundEnabled;
  }, [soundEnabled]);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/q/${encodeURIComponent(slug)}/state`);
      if (res.ok) {
        const data: PublicQueueState = await res.json();
        setState(data);
      }
    } catch {
      // Ignore transient network errors
    }
  }, [slug]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleQueueEvent = useCallback((evt: RealtimeQueueEvent) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        waitingCount: evt.payload.waiting_count,
        waitingCodes: evt.payload.waiting_codes,
        nowServing: evt.payload.now_serving,
        business:
          evt.event === 'queue.toggled'
            ? { ...prev.business, isOpen: evt.payload.status === 'open' }
            : prev.business,
      };
    });

    if (evt.event === 'ticket.called' && evt.payload.code) {
      setHighlightedCode(evt.payload.code);
      playAirportChimeAndSpeak(
        soundRef.current,
        evt.payload.code,
        evt.payload.counter
      );
      window.setTimeout(() => {
        setHighlightedCode(null);
      }, 6000);
    }
  }, []);

  const { connected } = useQueueChannel({
    businessId: state?.business.id ?? null,
    onQueueEvent: handleQueueEvent,
    onReconnectOrVisible: fetchState,
  });

  if (!state) {
    return (
      <div className="min-h-[calc(100vh-57px)] bg-[#0F172A] text-white flex items-center justify-center p-8">
        <div className="text-slate-400 font-mono text-sm">
          Loading TV Queue Display...
        </div>
      </div>
    );
  }

  const nextFiveCodes = state.waitingCodes.slice(0, 5);
  const qrTokenToRender = state.business.qrToken || fallbackQrToken || '';
  const joinUrl = `${window.location.origin}/?view=join&slug=${encodeURIComponent(
    state.business.slug
  )}&k=${encodeURIComponent(qrTokenToRender)}`;

  return (
    <div className="min-h-[calc(100vh-57px)] bg-[#0F172A] text-[#F8FAFC] p-6 lg:p-10 flex flex-col justify-between">
      {/* Top TV Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white">
            {state.business.name}
          </h1>
          <div className="mt-1 flex items-center gap-2.5 text-sm text-slate-400">
            <span>
              {state.business.isOpen
                ? 'Walk-In Queue Open'
                : 'Queue Paused'}
            </span>
            <span aria-hidden="true">·</span>
            <span>Estimated wait for new joins: {state.estimatedNewJoinRange}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 min-h-[44px]"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-4 h-4 text-emerald-400" />
                <span>Audio Chime &amp; Voice On</span>
              </>
            ) : (
              <>
                <VolumeX className="w-4 h-4 text-slate-400" />
                <span>Audio Muted</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <Wifi
              className={`w-4 h-4 ${
                connected ? 'text-emerald-400' : 'text-amber-400'
              }`}
            />
            <span className="text-base font-bold text-white">
              {state.business.manilaTime}
            </span>
          </div>
        </div>
      </div>

      {/* Main Split TV Grid: 65% Now Serving Per Counter | 35% Up Next + QR */}
      <div className="my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 items-stretch">
        {/* Left: Now Serving Counters */}
        <div className="lg:col-span-8 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-emerald-400 tracking-wide">
              Now Serving by Counter
            </h2>
            <span className="text-xs text-slate-400">
              Please proceed when your ticket number flashes
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 flex-1">
            {state.nowServing.map((ns) => {
              const isFlashing =
                ns.ticketCode && ns.ticketCode === highlightedCode;
              return (
                <div
                  key={ns.counterId}
                  className={`rounded-2xl border p-6 lg:p-8 flex items-center justify-between transition-colors ${
                    isFlashing
                      ? 'border-emerald-400 bg-emerald-950/90'
                      : 'border-slate-800 bg-[#1E293B]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="text-xl lg:text-2xl font-semibold text-white">
                      {ns.counterName}
                    </div>
                    <div className="text-xs lg:text-sm text-slate-400">
                      {ns.serviceName ||
                        (ns.ticketCode ? 'Customer in service' : 'Ready for next customer')}
                    </div>
                  </div>

                  <div className="text-right">
                    {ns.ticketCode ? (
                      <div
                        className={`text-5xl lg:text-7xl font-bold font-mono tabular-nums tracking-tight ${
                          isFlashing ? 'text-emerald-300' : 'text-emerald-400'
                        }`}
                      >
                        {ns.ticketCode}
                      </div>
                    ) : (
                      <div className="text-2xl lg:text-3xl font-mono text-slate-500">
                        AVAILABLE
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Next 5 Waiting Codes + Live QR Code */}
        <div className="lg:col-span-4 flex flex-col justify-between gap-6">
          <div className="rounded-2xl border border-slate-800 bg-[#1E293B] p-6 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <h2 className="text-sm font-semibold text-slate-200">
                  Up Next in Line
                </h2>
                <span className="text-xs font-mono tabular-nums text-amber-400">
                  {state.waitingCount} total waiting
                </span>
              </div>

              {nextFiveCodes.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  No customers waiting in queue. Walk right in!
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80 mt-2">
                  {nextFiveCodes.map((code, index) => (
                    <div
                      key={code}
                      className="py-3.5 flex items-center justify-between"
                    >
                      <span className="text-xs font-mono tabular-nums text-slate-400">
                        #{index + 1} Next
                      </span>
                      <span className="text-2xl lg:text-3xl font-bold font-mono tabular-nums text-white">
                        {code}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {state.waitingCount > 5 && (
              <div className="pt-3 border-t border-slate-800 text-xs text-slate-400 text-center font-mono tabular-nums">
                + {state.waitingCount - 5} more waiting after{' '}
                {nextFiveCodes[nextFiveCodes.length - 1]}
              </div>
            )}
          </div>

          {/* Scan to Join QR Box (Essential when daily QR rotation is active) */}
          {qrTokenToRender && (
            <div className="rounded-2xl border border-slate-800 bg-[#1E293B] p-5 flex items-center gap-4">
              <div className="bg-white p-2.5 rounded-xl shrink-0">
                <QRCodeSVG value={joinUrl} size={88} level="M" />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="text-xs font-semibold text-emerald-400">
                  {state.business.rotateQrDaily
                    ? 'Daily Dynamic QR Code'
                    : 'Scan to Join Queue'}
                </div>
                <div className="text-sm font-bold text-white">
                  Get Your Ticket on Your Phone
                </div>
                <p className="text-xs text-slate-400 leading-snug">
                  Track your live position and receive an SMS when your turn is
                  near.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
