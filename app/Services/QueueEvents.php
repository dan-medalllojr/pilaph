<?php

namespace App\Services;

use App\Enums\TicketStatus;
use App\Jobs\BroadcastQueueUpdate;
use App\Models\Business;
use App\Models\Ticket;

/**
 * Called by actions after a queue change commits: refreshes the cached public
 * snapshot and broadcasts the change to everyone watching (Plan.md, "Real-time
 * design rules"). Without Supabase configured, pages fall back to polling.
 */
class QueueEvents
{
    public function __construct(
        private PublicQueueState $queueState,
        private SupabaseBroadcaster $broadcaster,
    ) {}

    public function ticketJoined(Ticket $ticket): void
    {
        $this->changed($ticket->business, 'ticket.joined', $ticket, [$ticket]);
    }

    /**
     * @param  Ticket|null  $finished  The ticket the counter finished to make room, if any.
     * @param  bool  $recalled  Re-announcing a ticket that was already called.
     */
    public function ticketCalled(Ticket $called, ?Ticket $finished = null, bool $recalled = false): void
    {
        $affected = $finished !== null ? [$finished, $called] : [$called];

        $this->changed($called->business, 'ticket.called', $called, $affected, $recalled);
    }

    /**
     * Tickets finished, cancelled or removed.
     *
     * @param  list<Ticket>  $tickets
     */
    public function ticketsUpdated(Business $business, array $tickets): void
    {
        $this->changed($business, 'ticket.updated', count($tickets) === 1 ? $tickets[0] : null, $tickets);
    }

    public function queueToggled(Business $business): void
    {
        $this->changed($business, 'queue.toggled');
    }

    /**
     * @param  list<Ticket>  $affected
     */
    private function changed(Business $business, string $event, ?Ticket $subject = null, array $affected = [], bool $recalled = false): void
    {
        $this->queueState->forget($business);

        if (! $this->broadcaster->enabled()) {
            return;
        }

        BroadcastQueueUpdate::dispatch(
            $business->id,
            $event,
            $subject !== null ? $this->publicView($subject, $recalled) : null,
            array_map(
                fn (Ticket $ticket) => ['id' => $ticket->id] + $this->publicView($ticket, $recalled && $ticket->is($subject)),
                $affected,
            ),
        );
    }

    /**
     * What anyone may see about a ticket: never the customer's name or phone.
     *
     * @return array{code: string, counter: string|null, status: string, recalled?: true}
     */
    private function publicView(Ticket $ticket, bool $recalled): array
    {
        $view = [
            'code' => $ticket->code,
            'counter' => $ticket->status === TicketStatus::Called ? $ticket->counter?->name : null,
            'status' => $ticket->status->value,
        ];

        return $recalled ? $view + ['recalled' => true] : $view;
    }
}
