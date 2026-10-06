<?php

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->business = Business::factory()->create();
    $this->service = Service::factory()->for($this->business)->create(['default_minutes' => 15]);
    $this->counter = Counter::factory()->for($this->business)->create(['name' => 'Chair 1']);
});

function waitingTickets(Service $service, int $count): array
{
    return collect(range(1, $count))
        ->map(fn (int $i) => Ticket::factory()->for($service)->create(['joined_at' => now()->addSeconds($i)]))
        ->all();
}

test('shows the place in line and estimated wait', function () {
    [, , $third] = waitingTickets($this->service, 3);

    // 2 people ahead x 15 min / 1 counter = 30 min -> "30–35 min"
    $this->get(route('tickets.show', $third))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('public/ticket')
            ->where('ticket.code', $third->code)
            ->where('ticket.status', 'waiting')
            ->where('ticket.position', 3)
            ->where('ticket.wait', ['min' => 30, 'max' => 35]));
});

test('next in line waits under 5 minutes', function () {
    [$first] = waitingTickets($this->service, 1);

    $this->getJson(route('tickets.state', $first))
        ->assertJsonPath('position', 1)
        ->assertJsonPath('wait', ['min' => 0, 'max' => 5]);
});

test('people ahead count with their own service time', function () {
    $quick = Service::factory()->for($this->business)->create(['default_minutes' => 5]);
    Ticket::factory()->for($this->service)->create(['joined_at' => now()->addSecond()]); // 15 min
    Ticket::factory()->for($quick)->create(['joined_at' => now()->addSeconds(2)]);        // 5 min
    $mine = Ticket::factory()->for($quick)->create(['joined_at' => now()->addSeconds(3)]);

    // 15 + 5 = 20 min of work ahead -> "20–25 min"
    $this->getJson(route('tickets.state', $mine))
        ->assertJsonPath('position', 3)
        ->assertJsonPath('wait', ['min' => 20, 'max' => 25]);
});

test('more active counters shorten the estimate', function () {
    Counter::factory()->for($this->business)->create();
    [, , $third] = waitingTickets($this->service, 3);

    // 2 x 15 min / 2 counters = 15 min -> "15–20 min"
    $this->getJson(route('tickets.state', $third))
        ->assertOk()
        ->assertJsonPath('position', 3)
        ->assertJsonPath('wait', ['min' => 15, 'max' => 20]);
});

test('a called ticket shows where to go', function () {
    $ticket = Ticket::factory()->for($this->service)->called($this->counter)->create();

    $this->getJson(route('tickets.state', $ticket))
        ->assertOk()
        ->assertJsonPath('status', 'called')
        ->assertJsonPath('counter', 'Chair 1')
        ->assertJsonPath('position', null);
});

test('customers can leave the queue once; repeats change nothing', function () {
    [$ticket] = waitingTickets($this->service, 1);

    $this->post(route('tickets.cancel', $ticket))->assertRedirect(route('tickets.show', $ticket));
    $firstCancel = $ticket->fresh();
    $this->post(route('tickets.cancel', $ticket));

    expect($firstCancel->status)->toBe(TicketStatus::Cancelled)
        ->and($firstCancel->completed_at)->not->toBeNull()
        ->and($ticket->fresh()->completed_at->equalTo($firstCancel->completed_at))->toBeTrue();
});

test('a called ticket cannot be cancelled', function () {
    $ticket = Ticket::factory()->for($this->service)->called($this->counter)->create();

    $this->post(route('tickets.cancel', $ticket));

    expect($ticket->fresh()->status)->toBe(TicketStatus::Called);
});

test('unknown or malformed ticket links show not found', function (string $id) {
    $this->get("/t/{$id}")->assertNotFound();
    $this->getJson("/t/{$id}/state")->assertNotFound();
})->with([
    'random UUID' => '1b4e28ba-2fa1-4d2b-9d0b-6b7a3f1c2e11',
    'not a UUID' => 'not-a-ticket',
]);
