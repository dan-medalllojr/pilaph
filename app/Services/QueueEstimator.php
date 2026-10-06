<?php

namespace App\Services;

use App\Enums\TicketStatus;
use App\Models\Service;
use App\Models\Ticket;
use Illuminate\Support\Facades\DB;

/**
 * Wait-time estimates (Plan.md, "Position and estimated wait").
 *
 * Wait = the average service times of the people ahead (each for their own
 * service) / active counters. Your own service time isn't counted: the wait
 * is until you're called.
 */
class QueueEstimator
{
    /** How many recent finished tickets the average is based on. */
    private const SAMPLE_SIZE = 10;

    /**
     * Mean minutes per customer over the service's last 10 finished tickets
     * (called -> done); the service's default_minutes until there are any.
     */
    public function averageMinutes(Service $service): float
    {
        $recent = Ticket::query()
            ->select(['called_at', 'completed_at'])
            ->where('service_id', $service->id)
            ->where('status', TicketStatus::Done)
            ->whereNotNull('called_at')
            ->whereNotNull('completed_at')
            ->latest('completed_at')
            ->limit(self::SAMPLE_SIZE);

        $seconds = DB::query()
            ->fromSub($recent, 'recent')
            ->selectRaw('avg(extract(epoch from (completed_at - called_at))) as seconds')
            ->value('seconds');

        if ($seconds === null) {
            return (float) $service->default_minutes;
        }

        // Never estimate below a minute per customer, even after quick test runs.
        return max(1.0, (float) $seconds / 60);
    }

    /**
     * Minutes of service still needed for the given tickets (e.g. everyone
     * ahead), using each ticket's own service via its code prefix ("A-003" -> "A").
     *
     * @param  list<string>  $codes
     * @param  array<string, float>  $averageByPrefix
     */
    public function minutesOfWork(array $codes, array $averageByPrefix): float
    {
        $minutes = 0.0;

        foreach ($codes as $code) {
            $minutes += $averageByPrefix[strstr($code, '-', true) ?: $code] ?? 0.0;
        }

        return $minutes;
    }

    /**
     * Counters work through the line in parallel, so the wait shrinks with
     * each active counter. Rounded up to whole minutes.
     */
    public function waitMinutes(float $minutesOfWorkAhead, int $activeCounters): int
    {
        return (int) ceil($minutesOfWorkAhead / max(1, $activeCounters));
    }

    /**
     * Wait times are shown as a range, e.g. 12 minutes -> "10–15 min".
     *
     * @return array{min: int, max: int}
     */
    public function range(int $minutes): array
    {
        $min = intdiv(max(0, $minutes), 5) * 5;

        return ['min' => $min, 'max' => $min + 5];
    }
}
