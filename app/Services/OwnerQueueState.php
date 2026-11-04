<?php

namespace App\Services;

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use Illuminate\Support\Facades\DB;

/**
 * The owner dashboard's view of today's queue. Includes customer names (staff
 * call people by name) but never phone numbers, only whether there is one.
 *
 * @phpstan-type TicketRow array{id: string, code: string, customer_name: string, service: string, has_phone: bool, walk_in: bool, joined_at: string, called_at: string|null}
 */
class OwnerQueueState
{
    public function __construct(private PlanUsage $usage) {}

    /**
     * @return array{
     *     business: array{id: int, name: string, slug: string, is_open: bool, closed_reason: 'paused'|'after_cutoff'|'monthly_limit'|'full'|null, join_cutoff_time: string|null},
     *     counters: list<array{id: int, name: string, locked: bool, current: TicketRow|null}>,
     *     waiting: list<TicketRow>,
     *     stats: array{waiting: int, served: int, no_shows: int, average_wait_minutes: int|null},
     *     setup: array{active_services: int, active_counters: int},
     *     services: list<array{id: int, name: string}>
     * }
     */
    public function forBusiness(Business $business): array
    {
        $today = $business->today();
        $tickets = $business->tickets()
            ->where('queue_date', $today)
            ->with('service:id,name');

        $waiting = (clone $tickets)
            ->where('status', TicketStatus::Waiting)
            ->orderBy('joined_at')
            ->orderBy('number')
            ->get();

        $calledByCounter = (clone $tickets)
            ->where('status', TicketStatus::Called)
            ->whereNotNull('counter_id')
            ->get()
            ->keyBy('counter_id');

        $locked = $this->usage->lockedCounterIds($business);

        $counters = $business->counters()
            ->where('is_active', true)
            ->orderBy('name')
            ->get()
            ->map(function (Counter $counter) use ($calledByCounter, $locked) {
                $current = $calledByCounter->get($counter->id);

                return [
                    'id' => $counter->id,
                    'name' => $counter->name,
                    // Past the plan's counter limit: can finish its customer, not call the next.
                    'locked' => in_array($counter->id, $locked, true),
                    'current' => $current instanceof Ticket ? $this->row($current) : null,
                ];
            });

        $statusCounts = (clone $tickets)
            ->toBase()
            ->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        // Average time from joining to being called, for today's called tickets.
        $averageWaitSeconds = (clone $tickets)
            ->toBase()
            ->whereNotNull('called_at')
            ->selectRaw('avg(extract(epoch from (called_at - joined_at))) as seconds')
            ->value('seconds');

        // For adding a walk-in, in the join page's order.
        $services = $business->services()
            ->where('is_active', true)
            ->orderBy('prefix')
            ->get(['id', 'name']);

        return [
            'business' => [
                'id' => $business->id,
                'name' => $business->name,
                'slug' => $business->slug,
                'is_open' => $business->is_open,
                'closed_reason' => $business->joinClosedReason($waiting->count(), $this->usage->joinsClosedForMonth($business)),
                'join_cutoff_time' => $business->join_cutoff_time !== null
                    ? substr($business->join_cutoff_time, 0, 5)
                    : null,
            ],
            'counters' => array_values($counters->all()),
            'waiting' => array_values($waiting->map(fn (Ticket $ticket) => $this->row($ticket))->all()),
            'stats' => [
                'waiting' => $waiting->count(),
                'served' => (int) ($statusCounts[TicketStatus::Done->value] ?? 0),
                'no_shows' => (int) ($statusCounts[TicketStatus::NoShow->value] ?? 0),
                'average_wait_minutes' => $averageWaitSeconds !== null
                    ? (int) round((float) $averageWaitSeconds / 60)
                    : null,
            ],
            'setup' => [
                'active_services' => $services->count(),
                'active_counters' => $counters->count(),
            ],
            'services' => array_values($services->map(fn (Service $service) => [
                'id' => $service->id,
                'name' => $service->name,
            ])->all()),
        ];
    }

    /**
     * @return TicketRow
     */
    private function row(Ticket $ticket): array
    {
        return [
            'id' => $ticket->id,
            'code' => $ticket->code,
            'customer_name' => $ticket->customer_name,
            'service' => $ticket->service->name,
            'has_phone' => $ticket->phone !== null,
            'walk_in' => $ticket->walk_in,
            'joined_at' => $ticket->joined_at->toIso8601String(),
            'called_at' => $ticket->called_at?->toIso8601String(),
        ];
    }
}
