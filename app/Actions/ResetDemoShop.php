<?php

namespace App\Actions;

use App\Enums\TicketStatus;
use App\Enums\UserRole;
use App\Models\Business;
use App\Models\Counter;
use App\Models\Service;
use App\Models\User;
use App\Services\ShopPhotos;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Builds the public demo from scratch: Juan's Barbershop with two weeks of
 * history (for the stats page) and a live-looking queue right now. Run
 * hourly while the demo is on, so whatever visitors change is undone.
 *
 * The demo owner has no password (the "Try the demo" button is the only
 * way in) and no phone numbers are seeded, so nothing is ever texted.
 */
class ResetDemoShop
{
    public function __construct(private ShopPhotos $photos) {}

    private const NAMES = [
        'Juan dela Cruz', 'Maria Santos', 'Jose Reyes', 'Ana Bautista', 'Mark Villanueva',
        'Kristine Garcia', 'Angelo Mendoza', 'Princess Ramos', 'John Paul Castillo',
        'Mary Grace Aquino', 'Jericho Navarro', 'Rhea Fernandez', 'Carlo Domingo',
        'Nicole Pascual', 'Paolo Soriano', 'Jasmine Lim', 'Rommel Torres', 'Lovely Cruz',
        'Jun Flores', 'Bea Tolentino', 'Miguel Ocampo', 'Joanna Dizon', 'Ramon Salazar',
        'Kimberly Tan', 'Noel Aguilar', 'Grace Mercado', 'Dennis Manalo', 'Liza Panganiban',
    ];

    /** Busier mid-morning and late afternoon, like a real barbershop. */
    private const JOIN_HOURS = [9, 10, 10, 10, 11, 11, 11, 12, 13, 14, 15, 15, 16, 16, 16, 17, 17, 18];

    public function execute(): User
    {
        return DB::transaction(function () {
            Business::query()->where('is_demo', true)->each(function (Business $old) {
                $this->photos->delete($old);
                $old->delete();
            });

            $business = Business::query()->create([
                'name' => "Juan's Barbershop",
                'slug' => Business::query()->where('slug', 'pilaph-demo')->exists()
                    ? 'pilaph-demo-'.Str::lower(Str::random(6))
                    : 'pilaph-demo',
                'near_threshold' => 3,
                'max_waiting' => 30,
                'join_cutoff_time' => '20:00',
                'timezone' => 'Asia/Manila',
            ]);
            $business->forceFill(['is_demo' => true])->save();

            $owner = $this->owner($business);

            $services = collect([
                ['Haircut', 'A', 25],
                ['Shave', 'B', 15],
                ['Haircut + shave', 'C', 35],
                ['Kids cut', 'D', 20],
            ])->map(fn (array $s) => $business->services()->create([
                'name' => $s[0],
                'prefix' => $s[1],
                'default_minutes' => $s[2],
                'is_active' => true,
            ]));

            $counters = collect(['Chair 1 - Mang Jun', 'Chair 2 - Ate Liza', 'Chair 3 - Kuya Ben'])
                ->map(fn (string $name) => $business->counters()->create([
                    'name' => $name,
                    'is_active' => true,
                ]));

            $this->seedHistory($business, $services, $counters);
            $this->seedToday($business, $services, $counters);

            return $owner;
        });
    }

    private function owner(Business $business): User
    {
        $owner = User::query()->firstOrNew(['email' => config('demo.email')]);
        $owner->forceFill([
            'name' => 'Demo Owner',
            'password' => null,
            'google_id' => null,
            'email_verified_at' => now(),
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
            'business_id' => $business->id,
            'role' => UserRole::Owner,
        ])->save();

        // Anything a visitor might have attached to the shared account.
        $owner->passkeys()->delete();
        $owner->pushSubscriptions()->delete();

        return $owner;
    }

    /**
     * The last 14 days: busier on weekends, mostly served, a few no-shows
     * and cancellations.
     *
     * @param  Collection<int, Service>  $services
     * @param  Collection<int, Counter>  $counters
     */
    private function seedHistory(Business $business, Collection $services, Collection $counters): void
    {
        $today = $business->localNow()->startOfDay();

        foreach (range(14, 1) as $daysAgo) {
            $day = $today->subDays($daysAgo);
            $count = $day->isWeekend() ? mt_rand(26, 34) : mt_rand(14, 24);

            $joins = collect(range(1, $count))
                ->map(fn () => $day->setTime(self::JOIN_HOURS[array_rand(self::JOIN_HOURS)], mt_rand(0, 59)))
                ->sort()
                ->values();

            $tickets = [];
            foreach ($joins as $joined) {
                $roll = mt_rand(1, 100);
                $tickets[] = [
                    'service' => $services->random(),
                    'counter' => $counters->random(),
                    'joined_at' => $joined,
                    'status' => $roll <= 7 ? TicketStatus::NoShow : ($roll <= 14 ? TicketStatus::Cancelled : TicketStatus::Done),
                    'wait' => mt_rand(4, 35),
                ];
            }

            $this->insertTickets($business, $day, $tickets);
        }
    }

    /**
     * Today: served customers since 9 AM, someone at two of the chairs and
     * a short line, whatever time a visitor drops by.
     *
     * @param  Collection<int, Service>  $services
     * @param  Collection<int, Counter>  $counters
     */
    private function seedToday(Business $business, Collection $services, Collection $counters): void
    {
        $now = $business->localNow();
        $today = $now->startOfDay();
        $tickets = [];

        // Served earlier today (only once the morning has started).
        $servedSoFar = max(0, min(24, ($now->hour - 9) * 3));
        for ($i = 1; $i <= $servedSoFar; $i++) {
            $joined = $today->setTime(9, 0)->addMinutes((int) (($i - 1) * (($now->hour - 9) * 60 - 45) / $servedSoFar));
            $tickets[] = [
                'service' => $services->random(),
                'counter' => $counters->random(),
                'joined_at' => $joined,
                'status' => mt_rand(1, 100) <= 8 ? TicketStatus::NoShow : TicketStatus::Done,
                'wait' => mt_rand(5, 25),
            ];
        }

        // At the chairs now, and waiting.
        foreach ([0, 1] as $chair) {
            $tickets[] = [
                'service' => $services->random(),
                'counter' => $counters[$chair],
                'joined_at' => $now->subMinutes(mt_rand(25, 40)),
                'status' => TicketStatus::Called,
                'wait' => mt_rand(15, 22),
            ];
        }
        foreach ([34, 27, 21, 15, 9, 4] as $minutesAgo) {
            $tickets[] = [
                'service' => $services->random(),
                'counter' => null,
                'joined_at' => $now->subMinutes($minutesAgo),
                'status' => TicketStatus::Waiting,
                'wait' => 0,
            ];
        }

        usort($tickets, fn (array $a, array $b) => $a['joined_at'] <=> $b['joined_at']);
        $this->insertTickets($business, $today, $tickets);
    }

    /**
     * Inserts one day's tickets, numbered per service in joining order.
     *
     * @param  list<array{service: Service, counter: Counter|null, joined_at: CarbonImmutable, status: TicketStatus, wait: int}>  $tickets
     */
    private function insertTickets(Business $business, CarbonImmutable $day, array $tickets): void
    {
        $numbers = [];
        $appTimezone = (string) config('app.timezone');
        $stored = fn (?CarbonImmutable $time) => $time?->setTimezone($appTimezone)->toDateTimeString();
        $rows = [];

        foreach ($tickets as $t) {
            $service = $t['service'];
            $number = $numbers[$service->id] = ($numbers[$service->id] ?? 0) + 1;
            $called = in_array($t['status'], [TicketStatus::Called, TicketStatus::Done, TicketStatus::NoShow], true)
                ? $t['joined_at']->addMinutes($t['wait'])
                : null;
            $completed = match ($t['status']) {
                TicketStatus::Done => $called?->addMinutes(max(5, $service->default_minutes + mt_rand(-5, 6))),
                TicketStatus::NoShow => $called?->addMinutes(3),
                TicketStatus::Cancelled => $t['joined_at']->addMinutes(mt_rand(5, 20)),
                default => null,
            };

            $rows[] = [
                'id' => (string) Str::uuid(),
                'business_id' => $business->id,
                'service_id' => $service->id,
                'counter_id' => $called !== null ? $t['counter']?->id : null,
                'queue_date' => $day->toDateString(),
                'number' => $number,
                'code' => sprintf('%s-%03d', $service->prefix, $number),
                'customer_name' => self::NAMES[array_rand(self::NAMES)],
                'phone' => null,
                'status' => $t['status']->value,
                'joined_at' => $stored($t['joined_at']),
                'called_at' => $stored($called),
                'completed_at' => $stored($completed),
                'idempotency_key' => (string) Str::uuid(),
                'device_id' => 'demo-'.Str::random(16),
                'created_at' => $stored($t['joined_at']),
                'updated_at' => $stored($completed ?? $called ?? $t['joined_at']),
            ];
        }

        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('tickets')->insert($chunk);
        }
    }
}
