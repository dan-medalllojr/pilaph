import { useEffect, useRef, useState } from 'react';

/** How often pages check for updates (phase 6 adds live updates on top). */
const POLL_MS = 10_000;

/**
 * Keeps server state fresh by polling a JSON endpoint.
 *
 * - Starts from the page props and resets whenever they change (e.g. after
 *   a form submit redirects back).
 * - Polls only while the page is visible and `shouldPoll` says so.
 * - Refetches when the page becomes visible again (phones drop connections
 *   when locked), after a random 0–2 s delay so returning phones don't all
 *   hit the server at the same moment.
 */
export function usePolledState<T>(
    initial: T,
    url: string,
    shouldPoll: (state: T) => boolean = () => true,
): T {
    const [state, setState] = useState(initial);
    const latest = useRef(initial);
    const shouldPollRef = useRef(shouldPoll);
    shouldPollRef.current = shouldPoll;

    useEffect(() => {
        latest.current = initial;
        setState(initial);
    }, [initial]);

    useEffect(() => {
        let timer: number | undefined;
        let stopped = false;

        const refresh = async () => {
            if (document.hidden || !shouldPollRef.current(latest.current)) {
                return;
            }

            try {
                const response = await fetch(url, {
                    headers: { Accept: 'application/json' },
                });
                if (response.ok && !stopped) {
                    const next = (await response.json()) as T;
                    latest.current = next;
                    setState(next);
                }
            } catch {
                // Offline for a moment: the next poll tries again.
            }
        };

        const schedule = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(async () => {
                await refresh();
                if (!stopped) {
                    schedule();
                }
            }, POLL_MS);
        };

        const onVisible = () => {
            if (!document.hidden) {
                window.setTimeout(refresh, Math.random() * 2000);
            }
        };

        schedule();
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            stopped = true;
            window.clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [url]);

    return state;
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
