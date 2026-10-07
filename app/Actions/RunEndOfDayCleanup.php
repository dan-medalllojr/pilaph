<?php

namespace App\Actions;

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Ticket;
use App\Services\QueueEvents;
use Illuminate\Support\Facades\DB;

/**
 * Closes out past days for one business (Plan.md, "End of day"): leftover
 * waiting tickets become cancelled, leftover called ones no-show, and a
 * shop with the nightly QR change gets a new QR token.
 *
 * Only touches days before today in the shop's timezone, so it is safe to
 * run any time and as often as needed; a missed night is caught up later.
 */
class RunEndOfDayCleanup
{
    public function __construct(private QueueEvents $events) {}

    /**
     * @return array{closed: int, rotated: bool}
     */
    public function execute(Business $business): array
    {
        $today = $business->today();

        [$tickets, $rotated] = DB::transaction(function () use ($business, $today) {
            $tickets = Ticket::query()
                ->where('business_id', $business->id)
                ->where('queue_date', '<', $today)
                ->whereIn('status', [TicketStatus::Waiting, TicketStatus::Called])
                ->lockForUpdate()
                ->get();

            foreach ($tickets as $ticket) {
                $ticket->update([
                    'status' => $ticket->status === TicketStatus::Waiting ? TicketStatus::Cancelled : TicketStatus::NoShow,
                    'completed_at' => now(),
                ]);
            }

            $rotated = $business->rotate_qr_daily && $business->qr_token_date->toDateString() < $today;
            if ($rotated) {
                $business->forceFill([
                    'qr_token' => Business::generateQrToken(),
                    'qr_token_date' => $today,
                ])->save();
            }

            return [array_values($tickets->all()), $rotated];
        });

        if ($tickets !== [] || $rotated) {
            $this->events->dayEnded($business, $tickets);
        }

        return ['closed' => count($tickets), 'rotated' => $rotated];
    }
}
