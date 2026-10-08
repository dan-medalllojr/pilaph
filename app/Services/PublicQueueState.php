<?php

namespace App\Services;

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Service;
use App\Models\Ticket;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Cache;

/**
 * Queue snapshots for customer pages and the TV display.
 *
 * Contains no personal data (no names or phone numbers), only ticket codes,
 * counts, counter names and average service times. Cached a few seconds per
 * business, so a burst of phones refreshing at once costs one set of queries.
 *
 * @phpstan-type Snapshot array{
 *     business: array{id: int, name: string, slug: string, closed_reason: 'paused'|'after_cutoff'|'monthly_limit'|'full'|null, join_cutoff_time: string|null},
 *     waiting_count: int,
 *     waiting_codes: list<string>,
 *     now_serving: list<array{counter: string, code: string}>,
 *     active_counters: int,
 *     average_minutes: array<string, float>,
 *     wait_if_joining_now: array{min: int, max: int},
 *     services: list<array{id: int, name: string, prefix: string}>
 * }
 */
class PublicQueueState
{
    private const CACHE_SECONDS = 3;

    public function __construct(
        private QueueEstimator $estimator,
        private PlanUsage $usage,
    ) {}

    /**
     * @return Snapshot
     */
    public function forBusiness(Business $business): array
    {
        return Cache::remember(
            $this->cacheKey($business),
            self::CACHE_SECONDS,
            fn () => $this->build($business),
        );
    }

    /**
     * Drop the cached snapshot after a change, so the next read is fresh.
     */
    public function forget(Business $business): void
    {
        Cache::forget($this->cacheKey($business));
    }

    /**
     * One customer's view of their ticket (no name or phone number).
     *
     * @return array{
     *     id: string,
     *     code: string,
     *     status: string,
     *     service: string,
     *     counter: string|null,
     *     recalled_at: string|null,
     *     position: int|null,
     *     wait: array{min: int, max: int}|null,
     *     past_day: bool,
     *     business: array{id: int, name: string, slug: string}
     * }
     */
    public function forTicket(Ticket $ticket): array
    {
        $business = $ticket->business;
        $position = null;
        $wait = null;

        if ($ticket->status === TicketStatus::Waiting) {
            $queue = $this->forBusiness($business);
            $index = array_search($ticket->code, $queue['waiting_codes'], true);

            if ($index === false) {
                // Joined after the cached snapshot was taken: take a fresh one.
                $this->forget($business);
                $queue = $this->forBusiness($business);
                $index = array_search($ticket->code, $queue['waiting_codes'], true);
            }

            if ($index !== false) {
                $position = $index + 1;
                $ahead = array_slice($queue['waiting_codes'], 0, $index);
                $wait = $this->estimator->range($this->estimator->waitMinutes(
                    $this->estimator->minutesOfWork($ahead, $queue['average_minutes']),
                    $queue['active_counters'],
                ));
            }
        }

        return [
            'id' => $ticket->id,
            'code' => $ticket->code,
            'status' => $ticket->status->value,
            'service' => $ticket->service->name,
            'counter' => $ticket->status === TicketStatus::Called ? $ticket->counter?->name : null,
            // The page rings again whenever this changes.
            'recalled_at' => $ticket->status === TicketStatus::Called ? $ticket->recalled_at?->toIso8601String() : null,
            'position' => $position,
            'wait' => $wait,
            // From a day that has ended: unfinished tickets closed with the queue.
            'past_day' => $ticket->queue_date->toDateString() < $business->today(),
            'business' => [
                'id' => $business->id,
                'name' => $business->name,
                'slug' => $business->slug,
            ],
        ];
    }

    private function cacheKey(Business $business): string
    {
        return "queue-state:{$business->id}";
    }

    /**
     * @return Snapshot
     */
    private function build(Business $business): array
    {
        $waitingCodes = array_values($this->waitingTickets($business)
            ->orderBy('joined_at')
            ->orderBy('number')
            ->get(['code'])
            ->map(fn (Ticket $ticket) => $ticket->code)
            ->all());

        $nowServing = array_values($business->tickets()
            ->where('queue_date', $business->today())
            ->where('status', TicketStatus::Called)
            ->whereNotNull('counter_id')
            ->with('counter:id,name')
            ->orderBy('called_at')
            ->get()
            ->map(fn (Ticket $ticket) => [
                'counter' => $ticket->counter->name ?? '',
                'code' => $ticket->code,
            ])
            ->all());

        $activeCounters = $business->counters()->where('is_active', true)->count();
        $services = $business->services()->orderBy('prefix')->get();

        // All services, not just active ones: someone may still be waiting
        // for a service the owner switched off today.
        $averageMinutes = $services
            ->mapWithKeys(fn (Service $service) => [
                $service->prefix => round($this->estimator->averageMinutes($service), 1),
            ])
            ->all();

        return [
            'business' => [
                'id' => $business->id,
                'name' => $business->name,
                'slug' => $business->slug,
                'closed_reason' => $business->joinClosedReason(count($waitingCodes), $this->usage->joinsClosedForMonth($business)),
                'join_cutoff_time' => $business->join_cutoff_time !== null
                    ? substr($business->join_cutoff_time, 0, 5)
                    : null,
            ],
            'waiting_count' => count($waitingCodes),
            'waiting_codes' => $waitingCodes,
            'now_serving' => $nowServing,
            'active_counters' => $activeCounters,
            'average_minutes' => $averageMinutes,
            // Someone joining now waits behind everyone, whatever their service.
            'wait_if_joining_now' => $this->estimator->range($this->estimator->waitMinutes(
                $this->estimator->minutesOfWork($waitingCodes, $averageMinutes),
                $activeCounters,
            )),
            'services' => array_values($services
                ->where('is_active', true)
                ->map(fn (Service $service) => [
                    'id' => $service->id,
                    'name' => $service->name,
                    'prefix' => $service->prefix,
                ])
                ->all()),
        ];
    }

    /**
     * Today's waiting tickets for the business.
     *
     * @return HasMany<Ticket, Business>
     */
    private function waitingTickets(Business $business): HasMany
    {
        return $business->tickets()
            ->where('queue_date', $business->today())
            ->where('status', TicketStatus::Waiting);
    }
}
