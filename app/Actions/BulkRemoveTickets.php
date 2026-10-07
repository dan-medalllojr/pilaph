<?php

namespace App\Actions;

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Ticket;
use App\Services\QueueEvents;
use Illuminate\Support\Facades\DB;

/**
 * Removes fake or spam tickets from the waiting list. They're cancelled
 * rather than deleted, so the day's records stay complete.
 */
class BulkRemoveTickets
{
    public function __construct(private QueueEvents $events) {}

    /**
     * @param  list<string>  $ticketIds
     * @return int How many tickets were removed.
     */
    public function execute(Business $business, array $ticketIds): int
    {
        $removed = DB::transaction(function () use ($business, $ticketIds) {
            // Only the shop's own waiting tickets; locked so a counter can't
            // call one of them at the same moment.
            $tickets = Ticket::query()
                ->where('business_id', $business->id)
                ->whereIn('id', $ticketIds)
                ->where('status', TicketStatus::Waiting)
                ->lockForUpdate()
                ->get();

            foreach ($tickets as $ticket) {
                $ticket->update([
                    'status' => TicketStatus::Cancelled,
                    'completed_at' => now(),
                ]);
            }

            return $tickets;
        });

        if ($removed->isNotEmpty()) {
            $this->events->ticketsUpdated($business, array_values($removed->all()));
        }

        return $removed->count();
    }
}
