import { useEffect, useRef, useState } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NowServingEntry } from '../types/queue.ts';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

let supabaseClient: SupabaseClient | null = null;
if (supabaseUrl && supabaseAnonKey) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  } catch {
    supabaseClient = null;
  }
}

export interface RealtimeQueueEvent {
  type: 'broadcast';
  channel: string;
  event: 'ticket.joined' | 'ticket.called' | 'ticket.updated' | 'queue.toggled';
  payload: {
    code: string | null;
    counter: string | null;
    status: string;
    waiting_count: number;
    waiting_codes: string[];
    now_serving: NowServingEntry[];
  };
  timestamp: string;
}

export interface RealtimeTicketEvent {
  type: 'broadcast';
  channel: string;
  event: 'ticket.called' | 'ticket.cancelled' | 'ticket.updated';
  payload: {
    code: string;
    counter: string | null;
    status: string;
  };
  timestamp: string;
}

interface UseQueueChannelOptions {
  businessId?: number | null;
  ticketUuid?: string | null;
  onQueueEvent?: (evt: RealtimeQueueEvent) => void;
  onTicketEvent?: (evt: RealtimeTicketEvent) => void;
  onReconnectOrVisible?: () => void;
  pollIntervalMs?: number;
}

/**
 * Connects to both Supabase Realtime Broadcast (when VITE_SUPABASE_URL is configured)
 * and the built-in WebSocket channel (`queue:{business_id}` and/or `ticket:{ticket_uuid}`).
 * Implements the architecture rules:
 * - Customer pages compute their own position locally from `waiting_codes` on broadcast events.
 * - Refetches state on reconnect and when tab becomes visible again with a random 0–2 second jitter delay.
 * - Falls back to polling every 15–30 seconds if socket drops, pausing while page is hidden.
 */
export function useQueueChannel({
  businessId,
  ticketUuid,
  onQueueEvent,
  onTicketEvent,
  onReconnectOrVisible,
  pollIntervalMs = 20000,
}: UseQueueChannelOptions) {
  const [connected, setConnected] = useState(false);
  const onQueueEventRef = useRef(onQueueEvent);
  const onTicketEventRef = useRef(onTicketEvent);
  const onReconnectRef = useRef(onReconnectOrVisible);

  useEffect(() => {
    onQueueEventRef.current = onQueueEvent;
    onTicketEventRef.current = onTicketEvent;
    onReconnectRef.current = onReconnectOrVisible;
  }, [onQueueEvent, onTicketEvent, onReconnectOrVisible]);

  // 1. Supabase Realtime Broadcast listener (when VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY are set)
  useEffect(() => {
    if (!supabaseClient || (!businessId && !ticketUuid)) return;

    const channelsToCleanUp: ReturnType<SupabaseClient['channel']>[] = [];

    if (businessId) {
      const topic = `queue:${businessId}`;
      const qChannel = supabaseClient
        .channel(topic)
        .on('broadcast', { event: '*' }, (msg) => {
          if (onQueueEventRef.current && msg.payload) {
            onQueueEventRef.current({
              type: 'broadcast',
              channel: topic,
              event: (msg.event as RealtimeQueueEvent['event']) || 'ticket.updated',
              payload: msg.payload as RealtimeQueueEvent['payload'],
              timestamp: new Date().toISOString(),
            });
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setConnected(true);
          }
        });
      channelsToCleanUp.push(qChannel);
    }

    if (ticketUuid) {
      const topic = `ticket:${ticketUuid}`;
      const tChannel = supabaseClient
        .channel(topic)
        .on('broadcast', { event: '*' }, (msg) => {
          if (onTicketEventRef.current && msg.payload) {
            onTicketEventRef.current({
              type: 'broadcast',
              channel: topic,
              event: (msg.event as RealtimeTicketEvent['event']) || 'ticket.updated',
              payload: msg.payload as RealtimeTicketEvent['payload'],
              timestamp: new Date().toISOString(),
            });
          }
        })
        .subscribe();
      channelsToCleanUp.push(tChannel);
    }

    return () => {
      for (const ch of channelsToCleanUp) {
        supabaseClient?.removeChannel(ch);
      }
    };
  }, [businessId, ticketUuid]);

  // 2. Built-in WebSocket listener + visibilitychange refetch + fallback polling
  useEffect(() => {
    if (!businessId && !ticketUuid) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let jitterTimer: number | null = null;
    let unmounted = false;
    let hadConnectedOnce = false;

    const connect = () => {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        ws = new WebSocket(wsUrl);
      } catch {
        return;
      }

      ws.onopen = () => {
        if (unmounted || !ws) return;
        setConnected(true);

        if (businessId) {
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              channel: `queue:${businessId}`,
            })
          );
        }
        if (ticketUuid) {
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              channel: `ticket:${ticketUuid}`,
            })
          );
        }

        // If reconnecting after a drop, refetch state with random 0–2s jitter
        if (hadConnectedOnce && onReconnectRef.current) {
          const delay = Math.floor(Math.random() * 2000);
          jitterTimer = window.setTimeout(() => {
            if (!unmounted && onReconnectRef.current) {
              onReconnectRef.current();
            }
          }, delay);
        }
        hadConnectedOnce = true;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'broadcast') {
            if (
              typeof msg.channel === 'string' &&
              msg.channel.startsWith('queue:') &&
              onQueueEventRef.current
            ) {
              onQueueEventRef.current(msg as RealtimeQueueEvent);
            } else if (
              typeof msg.channel === 'string' &&
              msg.channel.startsWith('ticket:') &&
              onTicketEventRef.current
            ) {
              onTicketEventRef.current(msg as RealtimeTicketEvent);
            }
          }
        } catch {
          // Ignore invalid JSON
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        reconnectTimer = window.setTimeout(connect, 3500);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    // Refetch when locked phone screen wakes up / tab becomes visible again (0–2s random delay)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && onReconnectRef.current) {
        const delay = Math.floor(Math.random() * 2000);
        jitterTimer = window.setTimeout(() => {
          if (!unmounted && onReconnectRef.current) {
            onReconnectRef.current();
          }
        }, delay);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Fallback slow polling when hidden is false
    const pollTimer = window.setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        onReconnectRef.current
      ) {
        onReconnectRef.current();
      }
    }, pollIntervalMs);

    return () => {
      unmounted = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (jitterTimer) window.clearTimeout(jitterTimer);
      window.clearInterval(pollTimer);
      ws?.close();
    };
  }, [businessId, ticketUuid, pollIntervalMs]);

  return { connected };
}
