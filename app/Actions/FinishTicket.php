<?php

namespace App\Actions;

use App\Enums\TicketStatus;
use App\Models\Ticket;
use App\Services\QueueEvents;

/**
 * Marks a called ticket as done or no-show. Only a called ticket can be
 * finished, so a repeated tap changes nothing.
 */
class FinishTicket
{
    public function __construct(private QueueEvents $events) {}

    /**
     * @param  TicketStatus::Done|TicketStatus::NoShow  $outcome
     * @return bool Whether the ticket changed.
     */
    public function execute(Ticket $ticket, TicketStatus $outcome): bool
    {
        $finished = Ticket::query()
            ->whereKey($ticket->id)
            ->where('status', TicketStatus::Called)
            ->update([
                'status' => $outcome,
                'completed_at' => now(),
                'updated_at' => now(),
            ]);

        if ($finished > 0) {
            $this->events->ticketsUpdated($ticket->business, [$ticket->refresh()]);
        }

        return $finished > 0;
    }
}
