<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;
});

function validSettings(array $overrides = []): array
{
    return array_merge([
        'name' => 'Juan Barbershop',
        'near_threshold' => 2,
        'max_waiting' => 30,
        'join_cutoff_time' => '21:30',
        'rotate_qr_daily' => '1',
    ], $overrides);
}

test('owners see their settings without the QR token', function () {
    $this->actingAs($this->owner)->get(route('business.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('business/settings')
            ->where('business.name', $this->business->name)
            ->where('joinUrl', url("/q/{$this->business->slug}"))
            ->missing('business.qr_token'))
        ->assertDontSee($this->business->qr_token);
});

test('owners can update their queue rules', function () {
    $this->actingAs($this->owner)
        ->put(route('business.update'), validSettings())
        ->assertRedirect(route('business.edit'))
        ->assertSessionHasNoErrors();

    $business = $this->business->fresh();
    expect($business->name)->toBe('Juan Barbershop')
        ->and($business->near_threshold)->toBe(2)
        ->and($business->max_waiting)->toBe(30)
        ->and($business->join_cutoff_time)->toStartWith('21:30')
        ->and($business->rotate_qr_daily)->toBeTrue();
});

test('empty limits and an unticked checkbox turn those rules off', function () {
    $this->business->update(['max_waiting' => 10, 'join_cutoff_time' => '20:00', 'rotate_qr_daily' => true]);

    $settings = validSettings(['max_waiting' => '', 'join_cutoff_time' => '']);
    unset($settings['rotate_qr_daily']);

    $this->actingAs($this->owner)->put(route('business.update'), $settings)
        ->assertSessionHasNoErrors();

    $business = $this->business->fresh();
    expect($business->max_waiting)->toBeNull()
        ->and($business->join_cutoff_time)->toBeNull()
        ->and($business->rotate_qr_daily)->toBeFalse();
});

test('settings are validated', function (array $overrides, string $field) {
    $this->actingAs($this->owner)
        ->put(route('business.update'), validSettings($overrides))
        ->assertSessionHasErrors($field);
})->with([
    'missing name' => [['name' => ''], 'name'],
    'near-turn below 1' => [['near_threshold' => 0], 'near_threshold'],
    'queue limit of 0' => [['max_waiting' => 0], 'max_waiting'],
    'impossible cutoff' => [['join_cutoff_time' => '25:00'], 'join_cutoff_time'],
]);

test('staff cannot change shop settings', function () {
    $staff = User::factory()->staff($this->business)->create();

    $this->actingAs($staff)->put(route('business.update'), validSettings())
        ->assertForbidden();
    $this->actingAs($staff)->get(route('business.edit'))
        ->assertForbidden();
});
