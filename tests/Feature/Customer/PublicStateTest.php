<?php

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use App\Services\QueueEstimator;

beforeEach(function () {
    $this->business = Business::factory()->create();
    $this->service = Service::factory()->for($this->business)->create(['prefix' => 'A']);
    $this->counter = Counter::factory()->for($this->business)->create(['name' => 'Chair 1']);

    $this->waiting = Ticket::factory()->for($this->service)->create([
        'customer_name' => 'Maria Clara',
        'phone' => '639171234567',
    ]);
    $this->called = Ticket::factory()->for($this->service)->called($this->counter)->create([
        'customer_name' => 'Jose Rizal',
        'phone' => '639189876543',
    ]);
});

test('public endpoints and pages never contain names or phone numbers', function (Closure $url) {
    $response = $this->get($url($this))->assertOk();

    foreach (['Maria Clara', 'Jose Rizal', '639171234567', '639189876543', '9171234567'] as $private) {
        $response->assertDontSee($private, escape: false);
    }
})->with([
    'queue state' => fn ($test) => route('queue.state', $test->business),
    'join page' => fn ($test) => route('queue.join', ['business' => $test->business, 'k' => $test->business->qr_token]),
    'waiting ticket state' => fn ($test) => route('tickets.state', $test->waiting),
    'called ticket state' => fn ($test) => route('tickets.state', $test->called),
    'ticket page' => fn ($test) => route('tickets.show', $test->waiting),
]);

test('the queue state lists codes in line order and who is being served', function () {
    $this->getJson(route('queue.state', $this->business))
        ->assertOk()
        ->assertJsonPath('waiting_count', 1)
        ->assertJsonPath('waiting_codes', [$this->waiting->code])
        ->assertJsonPath('now_serving', [['counter' => 'Chair 1', 'code' => $this->called->code]])
        ->assertJsonPath('active_counters', 1)
        ->assertJsonPath('average_minutes', ['A' => 15])
        // 1 person waiting x 15 min / 1 counter
        ->assertJsonPath('wait_if_joining_now', ['min' => 15, 'max' => 20])
        ->assertJsonMissingPath('business.qr_token');
});

test('estimates use the last 10 finished tickets, else the default minutes', function () {
    $service = Service::factory()->for($this->business)->create(['default_minutes' => 15]);
    $estimator = app(QueueEstimator::class);

    expect($estimator->averageMinutes($service))->toBe(15.0);

    // An old slow ticket that falls outside the last 10…
    Ticket::factory()->for($service)->create([
        'status' => TicketStatus::Done,
        'called_at' => now()->subHours(3),
        'completed_at' => now()->subHours(2),
    ]);
    // …and 10 recent ones: five 10-minute and five 20-minute services.
    foreach (range(1, 10) as $i) {
        $completed = now()->subMinutes(30 - $i);
        Ticket::factory()->for($service)->create([
            'status' => TicketStatus::Done,
            'called_at' => $completed->subMinutes($i % 2 === 0 ? 10 : 20),
            'completed_at' => $completed,
        ]);
    }

    expect($estimator->averageMinutes($service))->toBe(15.0);
});
