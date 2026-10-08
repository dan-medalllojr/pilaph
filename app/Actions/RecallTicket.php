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
        // Only while still called; the time lets the ticket page notice the
        // recall even if it misses the live message.
        $recalled = Ticket::query()
            ->whereKey($ticket->id)
            ->where('status', TicketStatus::Called)
            ->update(['recalled_at' => now(), 'updated_at' => now()]);

        if ($recalled === 0) {
            return false;
        }

        $this->events->ticketCalled($ticket->refresh(), recalled: true);

        return true;
    }
}
