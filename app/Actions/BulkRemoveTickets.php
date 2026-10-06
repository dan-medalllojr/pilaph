<?php

namespace App\Actions;

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Ticket;
use App\Services\PublicQueueState;

/**
 * Removes fake or spam tickets from the waiting list. They're cancelled
 * rather than deleted, so the day's records stay complete.
 */
class BulkRemoveTickets
{
    public function __construct(private PublicQueueState $queueState) {}

    /**
     * @param  list<string>  $ticketIds
     * @return int How many tickets were removed.
     */
    public function execute(Business $business, array $ticketIds): int
    {
        $removed = Ticket::query()
            ->where('business_id', $business->id)
            ->whereIn('id', $ticketIds)
            ->where('status', TicketStatus::Waiting)
            ->update([
                'status' => TicketStatus::Cancelled,
                'completed_at' => now(),
                'updated_at' => now(),
            ]);

        if ($removed > 0) {
            $this->queueState->forget($business);
        }

        return $removed;
    }
}
