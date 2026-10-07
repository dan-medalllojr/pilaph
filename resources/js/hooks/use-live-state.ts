import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtime } from '@/hooks/use-realtime';
import type { BroadcastMessage } from '@/hooks/use-realtime';

/** Polling interval used only while live updates are unavailable. */
const FALLBACK_POLL_MS = 20_000;

export type LiveControls<T> = {
    state: T;
    setState: (next: T) => void;
    /** Fetch the authoritative state from the server. */
    refetch: () => void;
};

type Options<T> = {
    /** Starting state (the page props). New props replace it. */
    initial: T;
    /** JSON endpoint returning the full state. */
    url: string;
    /** Realtime channels to listen to, for the current state. */
    topics: (state: T) => string[];
    /** How to apply a broadcast. Defaults to refetching. */
    onEvent?: (message: BroadcastMessage, controls: LiveControls<T>) => void;
    /** Whether the state can still change (e.g. the ticket isn't finished). */
    active?: (state: T) => boolean;
};

/**
 * Server state kept current with Supabase Realtime (Plan.md, "Real-time
 * design rules"):
 * - applies broadcasts as they arrive;
 * - refetches after a reconnect and when the page becomes visible again,
 *   after a random 0–2 s delay so phones don't all hit the server at once;
 * - falls back to polling every 20 s while live updates are down, and never
 *   polls a hidden page.
 */
export function useLiveState<T>({
    initial,
    url,
    topics,
    onEvent,
    active = () => true,
}: Options<T>): { state: T; live: boolean } {
    const [state, setStateRaw] = useState(initial);
    const latest = useRef(initial);
    const requestSeq = useRef(0);
    const onEventRef = useRef(onEvent);
    const activeRef = useRef(active);

    useEffect(() => {
        onEventRef.current = onEvent;
        activeRef.current = active;
    });

    const setState = useCallback((next: T) => {
        latest.current = next;
        setStateRaw(next);
    }, []);

    useEffect(() => {
        setState(initial);
    }, [initial, setState]);

    const refetch = useCallback(async () => {
        // Only the newest request wins, so a slow response can't overwrite a newer one.
        const seq = ++requestSeq.current;

        try {
            const response = await fetch(url, {
                headers: { Accept: 'application/json' },
            });

            if (response.ok && seq === requestSeq.current) {
                setState((await response.json()) as T);
            }
        } catch {
            // Offline for a moment: the next event, poll or visit tries again.
        }
    }, [url, setState]);

    const refetchSoon = useCallback(() => {
        window.setTimeout(() => void refetch(), Math.random() * 2000);
    }, [refetch]);

    const live = useRealtime(
        active(state) ? topics(state) : [],
        (message) => {
            const controls = {
                state: latest.current,
                setState,
                refetch: () => void refetch(),
            };

            if (onEventRef.current) {
                onEventRef.current(message, controls);
            } else {
                controls.refetch();
            }
        },
        refetchSoon,
    );

    // Fallback polling, only while live updates are unavailable.
    useEffect(() => {
        if (live) {
            return;
        }

        const timer = window.setInterval(() => {
            if (!document.hidden && activeRef.current(latest.current)) {
                void refetch();
            }
        }, FALLBACK_POLL_MS);

        return () => window.clearInterval(timer);
    }, [live, refetch]);

    // Phones drop connections when locked: catch up when the page is shown again.
    useEffect(() => {
        const onVisible = () => {
            if (!document.hidden && activeRef.current(latest.current)) {
                refetchSoon();
            }
        };

        document.addEventListener('visibilitychange', onVisible);

        return () =>
            document.removeEventListener('visibilitychange', onVisible);
    }, [refetchSoon]);

    return { state, live };
}

/**
 * The current time, updated every `intervalMs`, for "waited 12 min" labels.
 */
export function useNow(intervalMs = 30_000): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), intervalMs);

        return () => window.clearInterval(timer);
    }, [intervalMs]);

    return now;
}
