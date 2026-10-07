<?php

use App\Models\Business;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('new users set up their shop before anything else', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->get(route('services.index'))
        ->assertRedirect(route('business.setup'));
    $this->actingAs($user)->get(route('business.setup'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('business/setup'));
});

test('creating a shop makes the user its owner', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->post(route('business.store'), ['name' => "Juan's Barbershop"])
        ->assertRedirect(route('services.index'));

    $user->refresh();
    expect($user->business?->name)->toBe("Juan's Barbershop")
        ->and($user->business?->slug)->toBe('juans-barbershop')
        ->and($user->isOwner())->toBeTrue();
});

test('shop links stay unique', function () {
    Business::factory()->create(['slug' => 'juans-barbershop']);
    $user = User::factory()->create();

    $this->actingAs($user)->post(route('business.store'), ['name' => "Juan's Barbershop"]);

    expect($user->fresh()?->business?->slug)->toBe('juans-barbershop-2');
});

test('submitting the setup form twice creates only one shop', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->post(route('business.store'), ['name' => 'First']);
    $this->actingAs($user)->post(route('business.store'), ['name' => 'Second']);

    expect(Business::count())->toBe(1)
        ->and($user->fresh()?->business?->name)->toBe('First');
});

test('owners who already have a shop skip setup', function () {
    $owner = User::factory()->owner()->create();

    $this->actingAs($owner)->get(route('business.setup'))
        ->assertRedirect(route('dashboard'));
});

test('a shop name is required', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->post(route('business.store'), ['name' => ''])
        ->assertSessionHasErrors('name');

    expect(Business::count())->toBe(0);
});
