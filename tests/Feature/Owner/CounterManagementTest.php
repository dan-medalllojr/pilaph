<?php

use App\Models\Counter;
use App\Models\Ticket;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;
});

test('owners only see their own counters', function () {
    Counter::factory()->for($this->business)->create(['name' => 'Chair 1']);
    Counter::factory()->create(['name' => 'Elsewhere']);

    $this->actingAs($this->owner)->get(route('counters.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('counters/index')
            ->has('counters', 1)
            ->where('counters.0.name', 'Chair 1'));
});

test('owners can add, rename and switch off counters', function () {
    $this->actingAs($this->owner)
        ->post(route('counters.store'), ['name' => 'Chair 1'])
        ->assertSessionHasNoErrors();
    $counter = $this->business->counters()->sole();

    $this->actingAs($this->owner)
        ->put(route('counters.update', $counter), ['name' => 'Chair 1 — Kuya Jun'])
        ->assertSessionHasNoErrors();
    $this->actingAs($this->owner)
        ->put(route('counters.update', $counter), ['is_active' => '0'])
        ->assertSessionHasNoErrors();

    expect($counter->fresh())
        ->name->toBe('Chair 1 — Kuya Jun')
        ->is_active->toBeFalse();
});

test('counter names are unique within a shop', function () {
    Counter::factory()->for($this->business)->create(['name' => 'Chair 1']);

    $this->actingAs($this->owner)
        ->post(route('counters.store'), ['name' => 'Chair 1'])
        ->assertSessionHasErrors('name');
});

test('a counter that served tickets is kept; an unused one is deleted', function () {
    $used = Counter::factory()->for($this->business)->create();
    Ticket::factory()->called($used)->create();
    $unused = Counter::factory()->for($this->business)->create();

    $this->actingAs($this->owner)->delete(route('counters.destroy', $used));
    $this->actingAs($this->owner)->delete(route('counters.destroy', $unused));

    expect(Counter::find($used->id))->not->toBeNull()
        ->and(Counter::find($unused->id))->toBeNull();
});

test("owners cannot change another shop's counters", function () {
    $theirs = Counter::factory()->create(['name' => 'Theirs']);

    $this->actingAs($this->owner)
        ->put(route('counters.update', $theirs), ['name' => 'Mine now'])
        ->assertForbidden();
    $this->actingAs($this->owner)
        ->delete(route('counters.destroy', $theirs))
        ->assertForbidden();

    expect($theirs->fresh()?->name)->toBe('Theirs');
});
