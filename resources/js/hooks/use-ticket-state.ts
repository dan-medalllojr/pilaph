import { useEffect, useRef, useState } from 'react';
import { state as ticketStateRoute } from '@/routes/tickets';
import type { TicketState } from '@/types';

/** How often a waiting customer's page checks for updates (phase 6 adds live updates). */
const POLL_MS = 10_000;

const isActive = (ticket: TicketState) =>
    ticket.status === 'waiting' || ticket.status === 'called';

/**
 * Keeps a ticket page up to date by polling its state endpoint.
 *
 * - Polls only while the page is visible and the ticket is still active.
 * - Refetches when the page becomes visible again (phones drop connections
 *   when locked), after a random 0–2 s delay so returning phones don't all
 *   hit the server at the same moment.
 */
export function useTicketState(initial: TicketState): TicketState {
    const [ticket, setTicket] = useState(initial);
    const latest = useRef(initial);

    // New props (e.g. after cancelling) replace the polled state.
    useEffect(() => {
        latest.current = initial;
        setTicket(initial);
    }, [initial]);

    useEffect(() => {
        let timer: number | undefined;
        let cancelled = false;

        const refresh = async () => {
            if (document.hidden || !isActive(latest.current)) {
                return;
            }

            try {
                const response = await fetch(
                    ticketStateRoute.url(latest.current.id),
                    { headers: { Accept: 'application/json' } },
                );
                if (response.ok && !cancelled) {
                    const next = (await response.json()) as TicketState;
                    latest.current = next;
                    setTicket(next);
                }
            } catch {
                // Offline for a moment: the next poll tries again.
            }
        };

        const schedule = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(async () => {
                await refresh();
                if (!cancelled) {
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
            cancelled = true;
            window.clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    return ticket;
}
