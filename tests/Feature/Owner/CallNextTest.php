<?php

use App\Enums\TicketStatus;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

beforeEach(function () {
    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;
    $this->haircut = Service::factory()->for($this->business)->create(['prefix' => 'A']);
    $this->beard = Service::factory()->for($this->business)->create(['prefix' => 'B']);
    $this->chair = Counter::factory()->for($this->business)->create(['name' => 'Chair 1']);
});

function callNext(Counter $counter, ?Ticket $expectedCurrent = null)
{
    return test()->post(route('dashboard.call-next', $counter), [
        'expected_current_ticket_id' => $expectedCurrent?->id ?? '',
    ]);
}

test('calls the customer who has waited longest, whatever their service', function () {
    $later = Ticket::factory()->for($this->haircut)->create(['joined_at' => now()->subMinutes(2)]);
    $earliest = Ticket::factory()->for($this->beard)->create(['joined_at' => now()->subMinutes(10)]);

    $this->actingAs($this->owner);
    callNext($this->chair)->assertRedirect(route('dashboard'));

    expect($earliest->fresh())
        ->status->toBe(TicketStatus::Called)
        ->counter_id->toBe($this->chair->id)
        ->called_at->not->toBeNull()
        ->and($later->fresh()->status)->toBe(TicketStatus::Waiting);
});

test('calling next finishes the customer at the counter', function () {
    $current = Ticket::factory()->for($this->haircut)->called($this->chair)->create();
    $next = Ticket::factory()->for($this->haircut)->create();

    $this->actingAs($this->owner);
    callNext($this->chair, $current);

    expect($current->fresh())
        ->status->toBe(TicketStatus::Done)
        ->completed_at->not->toBeNull()
        ->and($next->fresh()->status)->toBe(TicketStatus::Called);
});

test('with nobody waiting, the current customer is finished and nobody is called', function () {
    $current = Ticket::factory()->for($this->haircut)->called($this->chair)->create();

    $this->actingAs($this->owner);
    callNext($this->chair, $current)->assertRedirect(route('dashboard'));

    expect($current->fresh()->status)->toBe(TicketStatus::Done)
        ->and(Ticket::where('status', TicketStatus::Called)->count())->toBe(0);
});

test('a double tap with an out-of-date screen calls no one', function () {
    Ticket::factory()->for($this->haircut)->count(3)->create();
    $this->actingAs($this->owner)->from(route('dashboard'));

    // First tap: the counter was free.
    callNext($this->chair);
    $called = Ticket::where('status', TicketStatus::Called)->sole();

    // Second tap from the same (stale) screen still says "free".
    callNext($this->chair)
        ->assertRedirect(route('dashboard'))
        ->assertSessionHas('inertia.flash_data.toast', fn ($toast) => $toast['message'] === "Already called {$called->code} at Chair 1.");

    expect(Ticket::where('status', TicketStatus::Called)->pluck('id')->all())->toBe([$called->id])
        ->and(Ticket::where('status', TicketStatus::Waiting)->count())->toBe(2);
});

test('a tap while the counter is still processing is turned away', function () {
    Ticket::factory()->for($this->haircut)->create();
    $lock = Cache::lock("counter:{$this->chair->id}:call-next", 10);
    $lock->get();

    $this->actingAs($this->owner)->from(route('dashboard'));
    callNext($this->chair)
        ->assertSessionHas('inertia.flash_data.toast', fn ($toast) => $toast['message'] === 'Still processing, please wait.');

    expect(Ticket::where('status', TicketStatus::Called)->count())->toBe(0);
    $lock->release();
});

test('a switched-off counter cannot call anyone', function () {
    $this->chair->update(['is_active' => false]);
    Ticket::factory()->for($this->haircut)->create();

    $this->actingAs($this->owner)->from(route('dashboard'));
    callNext($this->chair);

    expect(Ticket::where('status', TicketStatus::Called)->count())->toBe(0);
});

test('two counters call two different customers', function () {
    $chair2 = Counter::factory()->for($this->business)->create(['name' => 'Chair 2']);
    [$first, $second] = Ticket::factory()->for($this->haircut)->count(2)
        ->sequence(['joined_at' => now()->subMinutes(5)], ['joined_at' => now()->subMinutes(3)])
        ->create();

    $this->actingAs($this->owner);
    callNext($this->chair);
    callNext($chair2);

    expect($first->fresh()->counter_id)->toBe($this->chair->id)
        ->and($second->fresh()->counter_id)->toBe($chair2->id);
});

test("owners cannot call next at another shop's counter", function () {
    $otherCounter = Counter::factory()->create();
    Ticket::factory()->create(['business_id' => $otherCounter->business_id]);

    $this->actingAs($this->owner);
    callNext($otherCounter)->assertForbidden();
});

test('staff can call next', function () {
    Ticket::factory()->for($this->haircut)->create();
    $staff = User::factory()->staff($this->business)->create();

    $this->actingAs($staff);
    callNext($this->chair)->assertRedirect(route('dashboard'));

    expect(Ticket::where('status', TicketStatus::Called)->count())->toBe(1);
});
