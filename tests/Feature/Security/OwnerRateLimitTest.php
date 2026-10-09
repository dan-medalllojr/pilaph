<?php

use App\Models\Business;
use App\Models\User;
use Illuminate\Testing\TestResponse;

function toggleQueue(User $owner, string $ip = '127.0.0.1'): TestResponse
{
    return test()->actingAs($owner)
        ->withServerVariables(['REMOTE_ADDR' => $ip])
        ->post(route('dashboard.queue.toggle'), ['is_open' => '1']);
}

test('an owner can make 60 changes a minute, then waits', function () {
    $owner = User::factory()->owner()->create();

    foreach (range(1, 60) as $i) {
        toggleQueue($owner)->assertRedirect();
    }

    toggleQueue($owner)->assertTooManyRequests();

    // Looking around is never limited.
    $this->actingAs($owner)->get(route('dashboard'))->assertOk();

    // A minute later it's fine again.
    $this->travel(61)->seconds();
    toggleQueue($owner)->assertRedirect();
});

test('in the app, the limit shows a message instead of an error page', function () {
    $owner = User::factory()->owner()->create();

    foreach (range(1, 60) as $i) {
        toggleQueue($owner);
    }

    $this->actingAs($owner)
        ->from(route('services.index'))
        ->withHeader('X-Inertia', 'true')
        ->post(route('dashboard.queue.toggle'), ['is_open' => '1'])
        ->assertRedirect(route('services.index'))
        ->assertSessionHas('inertia.flash_data.toast', fn ($toast) => $toast['message'] === "That's too many tries in a minute. Please wait a moment and try again.");
});

test('the shared demo account\'s limit is per visitor', function () {
    $this->artisan('demo:reset', ['--force' => true])->assertSuccessful();
    $demo = User::query()->where('email', config('demo.email'))->sole();

    foreach (range(1, 60) as $i) {
        toggleQueue($demo, '203.0.113.1')->assertRedirect();
    }

    toggleQueue($demo, '203.0.113.1')->assertTooManyRequests();
    toggleQueue($demo, '203.0.113.2')->assertRedirect();
});

test('owners of different shops each get their own limit', function () {
    [$first, $second] = User::factory()->owner()->count(2)->create();

    foreach (range(1, 60) as $i) {
        toggleQueue($first);
    }

    toggleQueue($first)->assertTooManyRequests();
    toggleQueue($second)->assertRedirect();
    expect(Business::query()->count())->toBe(2);
});
