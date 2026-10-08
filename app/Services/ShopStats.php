<?php

namespace App\Services;

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Counter;
use App\Models\Service;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Carbon\CarbonPeriod;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * How the shop's queue went over the last few days (business timezone).
 * Counts and times only: no names or phone numbers.
 *
 * @phpstan-type Stats array{
 *     days: int,
 *     from: string,
 *     to: string,
 *     joined: int,
 *     served: int,
 *     no_shows: int,
 *     cancelled: int,
 *     average_wait_minutes: int|null,
 *     average_service_minutes: int|null,
 *     busiest_hours: list<array{hour: int, joined: int}>,
 *     served_over_time: array{bucket: 'day'|'week'|'month', points: list<array{date: string, served: int}>},
 *     by_service: list<array{name: string, prefix: string, served: int, average_service_minutes: int|null}>,
 *     by_counter: list<array{name: string, served: int}>
 * }
 */
class ShopStats
{
    /**
     * The periods the stats page offers, in days (1 = today). Each plan
     * shows those within its history (config/plans.php).
     */
    public const PERIODS = [1, 7, 30, 90, 180, 365];

    /**
     * @return list<array{days: int, allowed: bool}>
     */
    public function periodsFor(Business $business): array
    {
        $history = $business->limits()->historyDays;

        return array_map(fn (int $days) => ['days' => $days, 'allowed' => $days <= $history], self::PERIODS);
    }

    /**
     * @return Stats
     */
    public function forBusiness(Business $business, int $days): array
    {
        $to = $business->localNow()->startOfDay();
        $from = $to->subDays($days - 1);

        $tickets = fn (): Builder => DB::table('tickets')
            ->where('tickets.business_id', $business->id)
            ->whereBetween('tickets.queue_date', [$from->toDateString(), $to->toDateString()]);

        $statusCounts = $tickets()
            ->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');
        $count = fn (TicketStatus $status) => (int) ($statusCounts[$status->value] ?? 0);

        // Joined to called, for everyone who was called.
        $averageWait = $tickets()
            ->whereNotNull('called_at')
            ->selectRaw('avg(extract(epoch from (called_at - joined_at))) as seconds')
            ->value('seconds');

        // Called to done, for everyone served.
        $averageService = $tickets()
            ->where('status', TicketStatus::Done)
            ->whereNotNull('called_at')
            ->selectRaw('avg(extract(epoch from (completed_at - called_at))) as seconds')
            ->value('seconds');

        return [
            'days' => $days,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'joined' => (int) $statusCounts->sum(),
            'served' => $count(TicketStatus::Done),
            'no_shows' => $count(TicketStatus::NoShow),
            'cancelled' => $count(TicketStatus::Cancelled),
            'average_wait_minutes' => self::minutes($averageWait),
            'average_service_minutes' => self::minutes($averageService),
            'busiest_hours' => $this->busiestHours($business, $tickets()),
            'served_over_time' => $this->servedOverTime($tickets(), $from, $to, $days),
            'by_service' => $this->byService($business, $tickets()),
            'by_counter' => $this->byCounter($business, $tickets()),
        ];
    }

    /**
     * Customers joining in each hour of the day, in the shop's local time.
     * Only the hours from the first to the last with anyone joining.
     *
     * @return list<array{hour: int, joined: int}>
     */
    private function busiestHours(Business $business, Builder $tickets): array
    {
        // Timestamps are stored in the app's timezone; convert to the shop's.
        $perHour = $tickets
            ->selectRaw(
                'extract(hour from (joined_at at time zone ?) at time zone ?)::int as hour, count(*) as joined',
                [config('app.timezone'), $business->timezone],
            )
            ->groupBy('hour')
            ->pluck('joined', 'hour');

        if ($perHour->isEmpty()) {
            return [];
        }

        return array_map(
            fn (int $hour) => ['hour' => $hour, 'joined' => (int) ($perHour[$hour] ?? 0)],
            range((int) $perHour->keys()->min(), (int) $perHour->keys()->max()),
        );
    }

    /**
     * Customers served per day, or per week or month over longer periods, so
     * the chart stays readable. Every day, week or month is listed, even
     * without customers; each point's date is the first day it covers.
     *
     * @return array{bucket: 'day'|'week'|'month', points: list<array{date: string, served: int}>}
     */
    private function servedOverTime(Builder $tickets, CarbonImmutable $from, CarbonImmutable $to, int $days): array
    {
        [$bucket, $start, $step] = match (true) {
            $days <= 31 => ['day', $from, '1 day'],
            // Postgres weeks start on Monday.
            $days <= 180 => ['week', $from->startOfWeek(CarbonInterface::MONDAY), '1 week'],
            default => ['month', $from->startOfMonth(), '1 month'],
        };

        $served = $tickets
            ->where('status', TicketStatus::Done)
            ->selectRaw("date_trunc('{$bucket}', queue_date)::date as bucket, count(*) as served")
            ->groupBy('bucket')
            ->pluck('served', 'bucket')
            ->mapWithKeys(fn ($count, $date) => [substr((string) $date, 0, 10) => (int) $count]);

        $points = [];
        foreach (CarbonPeriod::create($start, $step, $to) as $point) {
            $date = $point->toDateString();
            $points[] = ['date' => $date, 'served' => $served[$date] ?? 0];
        }

        return ['bucket' => $bucket, 'points' => $points];
    }

    /**
     * @return list<array{name: string, prefix: string, served: int, average_service_minutes: int|null}>
     */
    private function byService(Business $business, Builder $tickets): array
    {
        $rows = $tickets
            ->where('status', TicketStatus::Done)
            ->select('service_id', DB::raw('count(*) as served'), DB::raw('avg(extract(epoch from (completed_at - called_at))) as service_seconds'))
            ->groupBy('service_id')
            ->get()
            ->keyBy('service_id');

        return array_values($business->services()
            ->orderBy('prefix')
            ->get()
            ->filter(fn (Service $service) => $rows->has($service->id))
            ->map(fn (Service $service) => [
                'name' => $service->name,
                'prefix' => $service->prefix,
                'served' => (int) $rows[$service->id]->served,
                'average_service_minutes' => self::minutes($rows[$service->id]->service_seconds),
            ])
            ->sortByDesc('served')
            ->values()
            ->all());
    }

    /**
     * @return list<array{name: string, served: int}>
     */
    private function byCounter(Business $business, Builder $tickets): array
    {
        $served = $tickets
            ->where('status', TicketStatus::Done)
            ->whereNotNull('counter_id')
            ->select('counter_id', DB::raw('count(*) as served'))
            ->groupBy('counter_id')
            ->pluck('served', 'counter_id');

        return array_values($business->counters()
            ->orderBy('name')
            ->get()
            ->filter(fn (Counter $counter) => $served->has($counter->id))
            ->map(fn (Counter $counter) => ['name' => $counter->name, 'served' => (int) $served[$counter->id]])
            ->sortByDesc('served')
            ->values()
            ->all());
    }

    private static function minutes(mixed $seconds): ?int
    {
        return $seconds !== null ? (int) round((float) $seconds / 60) : null;
    }
}
