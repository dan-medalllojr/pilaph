<?php

namespace App\Actions;

use App\Enums\TicketStatus;
use App\Models\Ticket;
use App\Services\QueueEvents;

/**
 * Re-announces a called ticket whose customer hasn't come up yet: the ticket
 * page alerts again and the TV display shows the call again.
 */
class RecallTicket
{
    public function __construct(private QueueEvents $events) {}

    /**
     * @return bool Whether the ticket is still called (only those can be recalled).
     */
    public function execute(Ticket $ticket): bool
    {
        $ticket = $ticket->fresh();

        if ($ticket?->status !== TicketStatus::Called) {
            return false;
        }

        $this->events->ticketCalled($ticket, recalled: true);

        return true;
    }
}
