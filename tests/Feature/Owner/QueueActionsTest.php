<?php

use App\Enums\TicketStatus;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use App\Models\User;

beforeEach(function () {
    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;
    $this->service = Service::factory()->for($this->business)->create();
    $this->chair = Counter::factory()->for($this->business)->create();
});

test('done and no-show finish a called ticket; repeating changes nothing', function (string $route, TicketStatus $outcome) {
    $ticket = Ticket::factory()->for($this->service)->called($this->chair)->create();

    $this->actingAs($this->owner)->post(route($route, $ticket))->assertRedirect(route('dashboard'));
    $finishedAt = $ticket->fresh()->completed_at;
    $this->actingAs($this->owner)->post(route($route, $ticket));

    expect($ticket->fresh())
        ->status->toBe($outcome)
        ->completed_at->equalTo($finishedAt)->toBeTrue();
})->with([
    'done' => ['dashboard.tickets.done', TicketStatus::Done],
    'no-show' => ['dashboard.tickets.no-show', TicketStatus::NoShow],
]);

test('a waiting ticket cannot be marked done or no-show', function (string $route) {
    $ticket = Ticket::factory()->for($this->service)->create();

    $this->actingAs($this->owner)->post(route($route, $ticket));

    expect($ticket->fresh()->status)->toBe(TicketStatus::Waiting);
})->with(['dashboard.tickets.done', 'dashboard.tickets.no-show']);

test('done after no-show does not overwrite it', function () {
    $ticket = Ticket::factory()->for($this->service)->called($this->chair)->create();

    $this->actingAs($this->owner)->post(route('dashboard.tickets.no-show', $ticket));
    $this->actingAs($this->owner)->post(route('dashboard.tickets.done', $ticket));

    expect($ticket->fresh()->status)->toBe(TicketStatus::NoShow);
});

test('recall keeps the ticket called', function () {
    $ticket = Ticket::factory()->for($this->service)->called($this->chair)->create();
    $calledAt = $ticket->called_at;

    $this->actingAs($this->owner)->post(route('dashboard.tickets.recall', $ticket))->assertRedirect(route('dashboard'));

    expect($ticket->fresh())
        ->status->toBe(TicketStatus::Called)
        ->called_at->equalTo($calledAt)->toBeTrue();
});

test('each recall is timed, so the customer\'s page notices it even if the live message is missed', function () {
    $ticket = Ticket::factory()->for($this->service)->called($this->chair)->create();
    expect($this->getJson(route('tickets.state', $ticket))->json('recalled_at'))->toBeNull();

    $this->travelTo(now()->addMinute());
    $this->actingAs($this->owner)->post(route('dashboard.tickets.recall', $ticket));
    $first = $this->getJson(route('tickets.state', $ticket))->json('recalled_at');

    $this->travelTo(now()->addMinute());
    $this->actingAs($this->owner)->post(route('dashboard.tickets.recall', $ticket));
    $second = $this->getJson(route('tickets.state', $ticket))->json('recalled_at');

    expect($first)->not->toBeNull()
        ->and($second)->not->toBeNull()
        ->and($second)->not->toBe($first);
});

test('a ticket that is no longer called is not recalled', function () {
    $ticket = Ticket::factory()->for($this->service)->done()->create(['counter_id' => $this->chair->id]);

    $this->actingAs($this->owner)->post(route('dashboard.tickets.recall', $ticket));

    expect($ticket->fresh()->recalled_at)->toBeNull();
});

test('owners can remove spam tickets from the waiting list', function () {
    [$spam1, $spam2, $real] = Ticket::factory()->for($this->service)->count(3)->create();
    $called = Ticket::factory()->for($this->service)->called($this->chair)->create();
    $otherShop = Ticket::factory()->create();

    $this->actingAs($this->owner)
        ->post(route('dashboard.tickets.bulk-remove'), ['ticket_ids' => [$spam1->id, $spam2->id, $called->id, $otherShop->id]])
        ->assertRedirect(route('dashboard'));

    expect($spam1->fresh()->status)->toBe(TicketStatus::Cancelled)
        ->and($spam2->fresh()->status)->toBe(TicketStatus::Cancelled)
        ->and($real->fresh()->status)->toBe(TicketStatus::Waiting)
        // Only waiting tickets of the owner's own shop are touched.
        ->and($called->fresh()->status)->toBe(TicketStatus::Called)
        ->and($otherShop->fresh()->status)->toBe(TicketStatus::Waiting);
});

test('staff can run the queue but not remove tickets or pause it', function () {
    $staff = User::factory()->staff($this->business)->create();
    $called = Ticket::factory()->for($this->service)->called($this->chair)->create();
    $waiting = Ticket::factory()->for($this->service)->create();

    $this->actingAs($staff)->post(route('dashboard.tickets.done', $called))->assertRedirect();
    $this->actingAs($staff)->post(route('dashboard.tickets.bulk-remove'), ['ticket_ids' => [$waiting->id]])->assertForbidden();
    $this->actingAs($staff)->post(route('dashboard.queue.toggle'), ['is_open' => '0'])->assertForbidden();

    expect($called->fresh()->status)->toBe(TicketStatus::Done)
        ->and($waiting->fresh()->status)->toBe(TicketStatus::Waiting)
        ->and($this->business->fresh()->is_open)->toBeTrue();
});

test('owners pause and reopen the queue; a repeated tap keeps the state', function () {
    $this->actingAs($this->owner)->post(route('dashboard.queue.toggle'), ['is_open' => '0'])->assertRedirect(route('dashboard'));
    $this->actingAs($this->owner)->post(route('dashboard.queue.toggle'), ['is_open' => '0']);
    expect($this->business->fresh()->is_open)->toBeFalse();

    $this->actingAs($this->owner)->post(route('dashboard.queue.toggle'), ['is_open' => '1']);
    expect($this->business->fresh()->is_open)->toBeTrue();
});

test("owners cannot act on another shop's tickets", function (string $route) {
    $theirs = Ticket::factory()->called()->create();

    $this->actingAs($this->owner)->post(route($route, $theirs))->assertForbidden();

    expect($theirs->fresh()->status)->toBe(TicketStatus::Called);
})->with(['dashboard.tickets.done', 'dashboard.tickets.no-show', 'dashboard.tickets.recall']);

test('customers see the result on their next refresh', function () {
    $ticket = Ticket::factory()->for($this->service)->create();
    $this->getJson(route('tickets.state', $ticket))->assertJsonPath('status', 'waiting');

    $this->actingAs($this->owner)->post(route('dashboard.call-next', $this->chair), ['expected_current_ticket_id' => '']);

    $this->getJson(route('tickets.state', $ticket))
        ->assertJsonPath('status', 'called')
        ->assertJsonPath('counter', $this->chair->name);
});
