<?php

namespace App\Actions;

use App\Enums\TicketStatus;
use App\Models\Ticket;
use App\Services\PublicQueueState;

class CancelTicket
{
    public function __construct(private PublicQueueState $queueState) {}

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

        if ($cancelled > 0) {
            $this->queueState->forget($ticket->business);
        }

        return $ticket->refresh();
    }
}
