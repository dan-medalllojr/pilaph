<?php

use App\Enums\Plan;
use App\Enums\TicketStatus;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use App\Models\User;
use Carbon\CarbonImmutable;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    // 2:00 PM in Manila, so "today" is unambiguous.
    $this->travelTo(CarbonImmutable::parse('2026-10-07 14:00:00', 'Asia/Manila'));

    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;
    $this->haircut = Service::factory()->for($this->business)->create(['name' => 'Haircut', 'prefix' => 'A']);
    $this->shave = Service::factory()->for($this->business)->create(['name' => 'Shave', 'prefix' => 'B']);
    $this->chair1 = Counter::factory()->for($this->business)->create(['name' => 'Chair 1']);
    $this->chair2 = Counter::factory()->for($this->business)->create(['name' => 'Chair 2']);
});

/**
 * A ticket that joined at "Y-m-d H:i" (Manila), was called after $waited
 * minutes and finished $took minutes later.
 */
function servedTicket(Service $service, Counter $counter, string $joinedAt, int $waited = 10, int $took = 20, TicketStatus $status = TicketStatus::Done, array $extra = []): Ticket
{
    $joined = CarbonImmutable::parse($joinedAt, 'Asia/Manila');

    return Ticket::factory()->for($service)->create([
        'queue_date' => $joined->toDateString(),
        'status' => $status,
        'counter_id' => $counter->id,
        'joined_at' => $joined,
        'called_at' => $joined->addMinutes($waited),
        'completed_at' => $joined->addMinutes($waited + $took),
        ...$extra,
    ]);
}

function statsFor(object $test, ?int $days = null): array
{
    $response = $test->actingAs($test->owner)->get(route('stats.show', $days !== null ? ['days' => $days] : []))->assertOk();

    return $response->inertiaProps('stats');
}

test('totals count only this shop and this period', function () {
    servedTicket($this->haircut, $this->chair1, '2026-10-07 09:00', waited: 10, took: 20);
    servedTicket($this->haircut, $this->chair1, '2026-10-06 10:00', waited: 20, took: 40);
    servedTicket($this->shave, $this->chair2, '2026-10-05 10:30', status: TicketStatus::NoShow);
    Ticket::factory()->for($this->haircut)->create(['queue_date' => '2026-10-07', 'status' => TicketStatus::Cancelled]);
    Ticket::factory()->for($this->haircut)->create(['queue_date' => '2026-10-07']); // still waiting
    servedTicket($this->haircut, $this->chair1, '2026-09-20 10:00'); // too old for 7 days
    $otherShop = Service::factory()->create();
    servedTicket($otherShop, Counter::factory()->for($otherShop->business)->create(), '2026-10-07 10:00');

    $stats = statsFor($this);

    expect($stats)->toMatchArray([
        'days' => 7,
        'from' => '2026-10-01',
        'to' => '2026-10-07',
        'joined' => 5,
        'served' => 2,
        'no_shows' => 1,
        'cancelled' => 1,
        // (10 + 20 + 10) / 3 called, and (20 + 40) / 2 served.
        'average_wait_minutes' => 13,
        'average_service_minutes' => 30,
    ]);
});

test('today and the last 30 days are offered; other periods are not', function () {
    servedTicket($this->haircut, $this->chair1, '2026-10-07 09:00');
    servedTicket($this->haircut, $this->chair1, '2026-09-20 10:00');

    expect(statsFor($this, 1)['served'])->toBe(1)
        ->and(statsFor($this, 30)['served'])->toBe(2);

    $this->actingAs($this->owner)->get(route('stats.show', ['days' => 45]))->assertSessionHasErrors('days');
});

test('each plan offers the periods within its history; longer ones lead to Plan & billing', function () {
    $offered = fn () => collect($this->actingAs($this->owner)->get(route('stats.show'))->inertiaProps('periods'))
        ->where('allowed', true)->pluck('days')->all();

    expect($offered())->toBe([1, 7, 30, 90, 180, 365]);

    $this->business->forceFill(['plan' => Plan::Basic])->save();
    expect($offered())->toBe([1, 7, 30, 90, 180]);

    $this->business->forceFill(['plan' => Plan::Free, 'trial_ends_at' => null])->save();
    expect($offered())->toBe([1, 7, 30]);

    $this->actingAs($this->owner)->get(route('stats.show', ['days' => 90]))
        ->assertRedirect(route('plan.show'));
});

test('longer periods are charted by week or by month', function () {
    servedTicket($this->haircut, $this->chair1, '2026-10-07 09:00');
    servedTicket($this->haircut, $this->chair1, '2026-10-05 09:00'); // Monday of the same week
    servedTicket($this->haircut, $this->chair1, '2026-08-14 09:00');

    $weeks = statsFor($this, 90)['served_over_time'];
    expect($weeks['bucket'])->toBe('week')
        // From the Monday of the week 89 days ago, every week up to this one.
        ->and($weeks['points'][0]['date'])->toBe('2026-07-06')
        ->and(collect($weeks['points'])->last())->toBe(['date' => '2026-10-05', 'served' => 2])
        ->and(collect($weeks['points'])->firstWhere('date', '2026-08-10'))->toBe(['date' => '2026-08-10', 'served' => 1]);

    $months = statsFor($this, 365)['served_over_time'];
    expect($months['bucket'])->toBe('month')
        ->and($months['points'])->toHaveCount(13)
        ->and($months['points'][0])->toBe(['date' => '2025-10-01', 'served' => 0])
        ->and(collect($months['points'])->firstWhere('date', '2026-08-01')['served'])->toBe(1)
        ->and(collect($months['points'])->last())->toBe(['date' => '2026-10-01', 'served' => 2]);
});

test('busiest hours are in the shop\'s own time, with quiet hours in between', function () {
    servedTicket($this->haircut, $this->chair1, '2026-10-07 09:15');
    servedTicket($this->haircut, $this->chair1, '2026-10-07 11:05');
    servedTicket($this->haircut, $this->chair1, '2026-10-06 11:40');

    expect(statsFor($this)['busiest_hours'])->toBe([
        ['hour' => 9, 'joined' => 1],
        ['hour' => 10, 'joined' => 0],
        ['hour' => 11, 'joined' => 2],
    ]);

    // A shop an hour ahead of Manila sees the same customers an hour later.
    $this->business->update(['timezone' => 'Asia/Tokyo']);
    expect(collect(statsFor($this)['busiest_hours'])->pluck('hour')->all())->toBe([10, 11, 12]);
});

test('every day of the period is listed, even without customers', function () {
    servedTicket($this->haircut, $this->chair1, '2026-10-07 09:00');
    servedTicket($this->haircut, $this->chair1, '2026-10-07 10:00');
    servedTicket($this->haircut, $this->chair1, '2026-10-03 10:00');

    $served = statsFor($this)['served_over_time'];
    $days = $served['points'];

    expect($served['bucket'])->toBe('day')
        ->and($days)->toHaveCount(7)
        ->and($days[0])->toBe(['date' => '2026-10-01', 'served' => 0])
        ->and($days[2])->toBe(['date' => '2026-10-03', 'served' => 1])
        ->and($days[6])->toBe(['date' => '2026-10-07', 'served' => 2]);
});

test('services and counters are ranked by customers served', function () {
    servedTicket($this->haircut, $this->chair1, '2026-10-07 09:00', took: 30);
    servedTicket($this->shave, $this->chair2, '2026-10-07 09:30', took: 10);
    servedTicket($this->shave, $this->chair2, '2026-10-07 10:00', took: 20);

    $stats = statsFor($this);

    expect($stats['by_service'])->toBe([
        ['name' => 'Shave', 'prefix' => 'B', 'served' => 2, 'average_service_minutes' => 15],
        ['name' => 'Haircut', 'prefix' => 'A', 'served' => 1, 'average_service_minutes' => 30],
    ])->and($stats['by_counter'])->toBe([
        ['name' => 'Chair 2', 'served' => 2],
        ['name' => 'Chair 1', 'served' => 1],
    ]);
});

test('stats never include names or phone numbers', function () {
    servedTicket($this->haircut, $this->chair1, '2026-10-07 09:00', extra: ['customer_name' => 'Maria Clara', 'phone' => '639171234567']);

    $this->actingAs($this->owner)->get(route('stats.show'))
        ->assertDontSee('Maria')
        ->assertDontSee('63917');
});

test('an empty shop shows zeros, not errors', function () {
    expect(statsFor($this))->toMatchArray([
        'joined' => 0,
        'average_wait_minutes' => null,
        'busiest_hours' => [],
        'by_service' => [],
    ]);
});

test('the page is for the shop\'s own owner', function () {
    $this->get(route('stats.show'))->assertRedirect(route('login'));

    $this->actingAs($this->owner)->get(route('stats.show'))
        ->assertInertia(fn (Assert $page) => $page->component('stats'));
});
