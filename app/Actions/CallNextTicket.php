<?php

namespace App\Actions;

use App\Enums\TicketStatus;
use App\Exceptions\QueueConflict;
use App\Models\Counter;
use App\Models\Ticket;
use App\Services\PlanUsage;
use App\Services\QueueEvents;
use App\Services\QueueTexts;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * The owner taps "Call next" on a counter (Plan.md, key flow 2). A double tap
 * never calls two customers, and two counters never call the same customer.
 */
class CallNextTicket
{
    public function __construct(
        private QueueEvents $events,
        private QueueTexts $texts,
        private PlanUsage $usage,
    ) {}

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

        // Past the plan's counter limit (e.g. after a trial ended).
        if ($this->usage->isCounterLocked($counter)) {
            throw new QueueConflict("{$counter->name} can't call customers on the {$counter->business->currentPlan()->label()} plan. Upgrade under Plan & billing, or switch other counters off.");
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

        // After commit: tell the ticket pages, TV display and dashboard, and
        // text the customers who gave a phone number.
        if ($result['called'] !== null) {
            $this->events->ticketCalled($result['called'], $result['finished']);
            $this->texts->afterCall($result['called']);
        } elseif ($result['finished'] !== null) {
            $this->events->ticketsUpdated($business, [$result['finished']]);
        }

        return $result;
    }
}
