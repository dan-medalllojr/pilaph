<?php

use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;
    $this->service = Service::factory()->for($this->business)->create(['name' => 'Haircut']);
    $this->chair = Counter::factory()->for($this->business)->create(['name' => 'Chair 1']);
});

test('the dashboard shows each counter, the waiting list in order and today\'s stats', function () {
    $serving = Ticket::factory()->for($this->service)->called($this->chair)->create(['customer_name' => 'Ana']);
    $second = Ticket::factory()->for($this->service)->create(['customer_name' => 'Ben', 'joined_at' => now()->subMinutes(5)]);
    $first = Ticket::factory()->for($this->service)->withPhone()->create(['customer_name' => 'Cris', 'joined_at' => now()->subMinutes(9)]);
    Ticket::factory()->for($this->service)->done()->create(['joined_at' => now()->subMinutes(40), 'called_at' => now()->subMinutes(30)]);
    Ticket::factory()->for($this->service)->noShow()->create();

    $this->actingAs($this->owner)->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('dashboard')
            ->where('queue.counters.0.name', 'Chair 1')
            ->where('queue.counters.0.current.code', $serving->code)
            ->where('queue.counters.0.current.customer_name', 'Ana')
            ->where('queue.waiting.0.id', $first->id)
            ->where('queue.waiting.0.has_phone', true)
            ->where('queue.waiting.1.id', $second->id)
            ->where('queue.stats.waiting', 2)
            ->where('queue.stats.served', 1)
            ->where('queue.stats.no_shows', 1)
            ->missing('queue.waiting.0.phone'));
});

test('the dashboard never sends phone numbers to the browser', function () {
    Ticket::factory()->for($this->service)->create(['phone' => '639171234567']);

    $this->actingAs($this->owner)->get(route('dashboard'))->assertDontSee('639171234567');
    $this->actingAs($this->owner)->getJson(route('dashboard.state'))->assertDontSee('639171234567');
});

test('the dashboard only shows the owner\'s own shop', function () {
    $elsewhere = Ticket::factory()->create(['customer_name' => 'Someone Else']);

    $this->actingAs($this->owner)->getJson(route('dashboard.state'))
        ->assertOk()
        ->assertJsonPath('stats.waiting', 0)
        ->assertDontSee('Someone Else')
        ->assertDontSee($elsewhere->code);
});

test('yesterday\'s tickets are not part of today\'s queue', function () {
    Ticket::factory()->for($this->service)->create(['queue_date' => now()->subDay()->toDateString()]);

    $this->actingAs($this->owner)->getJson(route('dashboard.state'))
        ->assertJsonPath('stats.waiting', 0)
        ->assertJsonPath('waiting', []);
});
