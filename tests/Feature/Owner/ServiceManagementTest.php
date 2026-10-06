<?php

use App\Models\Service;
use App\Models\Ticket;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;
});

test('owners only see their own services', function () {
    Service::factory()->for($this->business)->create(['prefix' => 'B', 'name' => 'Beard trim']);
    $haircut = Service::factory()->for($this->business)->create(['prefix' => 'A', 'name' => 'Haircut']);
    Ticket::factory()->for($haircut)->create();
    Service::factory()->create(['name' => 'Someone else\'s service']);

    $this->actingAs($this->owner)->get(route('services.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('services/index')
            ->has('services', 2)
            ->where('services.0.prefix', 'A')
            ->where('services.0.has_tickets', true)
            ->where('services.1.has_tickets', false));
});

test('owners can add a service; letters are normalized to uppercase', function () {
    $this->actingAs($this->owner)
        ->post(route('services.store'), ['name' => 'Hair color', 'prefix' => ' hc ', 'default_minutes' => 45])
        ->assertRedirect(route('services.index'))
        ->assertSessionHasNoErrors();

    $service = $this->business->services()->sole();
    expect($service->prefix)->toBe('HC')
        ->and($service->default_minutes)->toBe(45)
        ->and($service->is_active)->toBeTrue();
});

test('a ticket letter is unique within a shop, not across shops', function () {
    Service::factory()->for($this->business)->create(['prefix' => 'A']);
    Service::factory()->create(['prefix' => 'B']);

    $this->actingAs($this->owner)
        ->post(route('services.store'), ['name' => 'Haircut', 'prefix' => 'a', 'default_minutes' => 15])
        ->assertSessionHasErrors(['prefix' => 'Another service already uses this prefix.']);

    $this->actingAs($this->owner)
        ->post(route('services.store'), ['name' => 'Beard', 'prefix' => 'B', 'default_minutes' => 15])
        ->assertSessionHasNoErrors();
});

test('ticket letters must be 1 to 3 letters', function (string $prefix) {
    $this->actingAs($this->owner)
        ->post(route('services.store'), ['name' => 'Haircut', 'prefix' => $prefix, 'default_minutes' => 15])
        ->assertSessionHasErrors('prefix');
})->with(['A1', 'ABCD', '-', '']);

test('owners can edit a service', function () {
    $service = Service::factory()->for($this->business)->create(['prefix' => 'A']);

    $this->actingAs($this->owner)
        ->put(route('services.update', $service), ['name' => 'Haircut + wash', 'prefix' => 'a', 'default_minutes' => 30])
        ->assertSessionHasNoErrors();

    expect($service->fresh())
        ->name->toBe('Haircut + wash')
        ->prefix->toBe('A')
        ->default_minutes->toBe(30);
});

test('the Active switch saves on its own', function () {
    $service = Service::factory()->for($this->business)->create(['name' => 'Haircut']);

    $this->actingAs($this->owner)
        ->put(route('services.update', $service), ['is_active' => '0'])
        ->assertSessionHasNoErrors();

    expect($service->fresh())
        ->is_active->toBeFalse()
        ->name->toBe('Haircut');
});

test('an unused service can be deleted', function () {
    $service = Service::factory()->for($this->business)->create();

    $this->actingAs($this->owner)->delete(route('services.destroy', $service))
        ->assertRedirect(route('services.index'));

    expect(Service::find($service->id))->toBeNull();
});

test('a service with ticket history is kept', function () {
    $service = Service::factory()->for($this->business)->create();
    Ticket::factory()->for($service)->done()->create();

    $this->actingAs($this->owner)->delete(route('services.destroy', $service))
        ->assertRedirect(route('services.index'));

    expect(Service::find($service->id))->not->toBeNull();
});

test("owners cannot change another shop's services", function () {
    $theirs = Service::factory()->create(['name' => 'Theirs']);

    $this->actingAs($this->owner)
        ->put(route('services.update', $theirs), ['name' => 'Mine now'])
        ->assertForbidden();
    $this->actingAs($this->owner)
        ->delete(route('services.destroy', $theirs))
        ->assertForbidden();

    expect($theirs->fresh()?->name)->toBe('Theirs');
});

test('staff cannot manage services', function () {
    $staff = User::factory()->staff($this->business)->create();
    $service = Service::factory()->for($this->business)->create();

    $this->actingAs($staff)
        ->post(route('services.store'), ['name' => 'X', 'prefix' => 'X', 'default_minutes' => 5])
        ->assertForbidden();
    $this->actingAs($staff)->put(route('services.update', $service), ['is_active' => '0'])
        ->assertForbidden();
    $this->actingAs($staff)->delete(route('services.destroy', $service))
        ->assertForbidden();
});
