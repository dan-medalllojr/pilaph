<?php

namespace App\Actions;

use App\Enums\TicketStatus;
use App\Models\Ticket;

/**
 * Re-announces a called ticket whose customer hasn't come up yet.
 */
class RecallTicket
{
    /**
     * @return bool Whether the ticket is still called (only those can be recalled).
     */
    public function execute(Ticket $ticket): bool
    {
        // Phase 6 broadcasts the re-announcement to the ticket page and TV display.
        return $ticket->fresh()?->status === TicketStatus::Called;
    }
}
