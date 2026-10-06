<?php

namespace App\Actions;

use App\Enums\TicketStatus;
use App\Exceptions\QueueConflict;
use App\Models\Counter;
use App\Models\Ticket;
use App\Services\PublicQueueState;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * The owner taps "Call next" on a counter (Plan.md, key flow 2). A double tap
 * never calls two customers, and two counters never call the same customer.
 */
class CallNextTicket
{
    public function __construct(private PublicQueueState $queueState) {}

    /**
     * Finishes the counter's current ticket and calls the oldest waiting one.
     *
     * @param  string|null  $expectedCurrentTicketId  The ticket the owner saw at
     *                                                this counter when they tapped.
     * @return array{finished: Ticket|null, called: Ticket|null} called is null when nobody is waiting.
     *
     * @throws QueueConflict when another tap is in progress or already went through.
     */
    public function execute(Counter $counter, ?string $expectedCurrentTicketId): array
    {
        if (! $counter->is_active) {
            throw new QueueConflict("{$counter->name} is switched off. Switch it on under Counters first.");
        }

        // 1. One "Call next" at a time per counter.
        $lock = Cache::lock("counter:{$counter->id}:call-next", 10);
        if (! $lock->get()) {
            throw new QueueConflict('Still processing, please wait.');
        }

        try {
            $business = $counter->business;
            $today = $business->today();

            $result = DB::transaction(function () use ($counter, $today, $business, $expectedCurrentTicketId): array {
                $current = Ticket::query()
                    ->where('counter_id', $counter->id)
                    ->where('queue_date', $today)
                    ->where('status', TicketStatus::Called)
                    ->lockForUpdate()
                    ->first();

                // 2. The owner's screen was out of date (e.g. an earlier tap
                // already went through): call no one, show the latest state.
                if ($current?->id !== $expectedCurrentTicketId) {
                    throw new QueueConflict($current !== null
                        ? "Already called {$current->code} at {$counter->name}."
                        : "{$counter->name} changed in the meantime. Here's the latest queue.");
                }

                // 3. Finish whoever is at the counter now.
                $current?->update([
                    'status' => TicketStatus::Done,
                    'completed_at' => now(),
                ]);

                // 4. Oldest waiting customer. SKIP LOCKED: if another counter is
                // calling that customer at this very moment, take the next one.
                $next = Ticket::query()
                    ->where('business_id', $business->id)
                    ->where('queue_date', $today)
                    ->where('status', TicketStatus::Waiting)
                    ->orderBy('joined_at')
                    ->orderBy('number')
                    ->lock('for update skip locked')
                    ->first();

                // 5. Call them to this counter.
                $next?->update([
                    'status' => TicketStatus::Called,
                    'counter_id' => $counter->id,
                    'called_at' => now(),
                ]);

                return ['finished' => $current, 'called' => $next];
            });
        } finally {
            $lock->release();
        }

        // After commit: customer pages and the TV see the change on their next refresh.
        $this->queueState->forget($business);

        return $result;
    }
}
