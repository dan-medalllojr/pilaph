import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type BroadcastMessage = {
    topic: string;
    event: string;
    payload: unknown;
};

/**
 * Listens to Supabase Realtime broadcasts on the given channels
 * (e.g. "queue:12", "ticket:<uuid>").
 *
 * Returns whether every channel is connected. When a channel comes back after
 * dropping (phones do this when locked), `onReconnect` runs after a random
 * 0–2 s delay, so reconnecting phones don't all refetch at the same moment.
 */
export function useRealtime(
    topics: string[],
    onMessage: (message: BroadcastMessage) => void,
    onReconnect?: () => void,
): boolean {
    const [live, setLive] = useState(false);
    const onMessageRef = useRef(onMessage);
    const onReconnectRef = useRef(onReconnect);

    useEffect(() => {
        onMessageRef.current = onMessage;
        onReconnectRef.current = onReconnect;
    });

    const key = topics.join('|');

    useEffect(() => {
        const client = supabase;
        const subscribed = key === '' ? [] : key.split('|');

        if (!client || subscribed.length === 0) {
            setLive(false);

            return;
        }

        const connected = new Map<string, boolean>();
        const everConnected = new Set<string>();
        let reconnectTimer: number | undefined;

        const channels: RealtimeChannel[] = subscribed.map((topic) =>
            client
                .channel(topic, { config: { broadcast: { self: false } } })
                .on('broadcast', { event: '*' }, ({ event, payload }) =>
                    onMessageRef.current({ topic, event, payload }),
                )
                .subscribe((status) => {
                    const isUp = status === 'SUBSCRIBED';
                    connected.set(topic, isUp);
                    setLive(subscribed.every((t) => connected.get(t)));

                    if (isUp && everConnected.has(topic)) {
                        // Back after a drop: catch up on anything missed.
                        window.clearTimeout(reconnectTimer);
                        reconnectTimer = window.setTimeout(
                            () => onReconnectRef.current?.(),
                            Math.random() * 2000,
                        );
                    }

                    if (isUp) {
                        everConnected.add(topic);
                    }
                }),
        );

        return () => {
            window.clearTimeout(reconnectTimer);
            channels.forEach((channel) => void client.removeChannel(channel));
            setLive(false);
        };
    }, [key]);

    return live;
}
