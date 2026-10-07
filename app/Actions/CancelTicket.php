<?php

namespace App\Actions;

use App\Enums\TicketStatus;
use App\Models\Ticket;
use App\Services\QueueEvents;

class CancelTicket
{
    public function __construct(private QueueEvents $events) {}

    /**
     * The customer leaves the queue. Only a waiting ticket can be cancelled;
     * repeating the request (or cancelling once called) changes nothing.
     */
    public function execute(Ticket $ticket): Ticket
    {
        $cancelled = Ticket::query()
            ->whereKey($ticket->id)
            ->where('status', TicketStatus::Waiting)
            ->update([
                'status' => TicketStatus::Cancelled,
                'completed_at' => now(),
                'updated_at' => now(),
            ]);

        $ticket->refresh();

        if ($cancelled > 0) {
            $this->events->ticketsUpdated($ticket->business, [$ticket]);
        }

        return $ticket;
    }
}
