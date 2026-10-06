import { usePolledState } from '@/hooks/use-polled-state';
import { state as ticketStateRoute } from '@/routes/tickets';
import type { TicketState } from '@/types';

const isActive = (ticket: TicketState) =>
    ticket.status === 'waiting' || ticket.status === 'called';

/**
 * A customer's ticket, kept up to date while it's still waiting or called.
 */
export function useTicketState(initial: TicketState): TicketState {
    return usePolledState(initial, ticketStateRoute.url(initial.id), isActive);
}
