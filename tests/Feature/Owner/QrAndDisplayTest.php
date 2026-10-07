<?php

use App\Models\Business;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;
});

test('the QR poster shows the join link with the current QR token', function () {
    $this->actingAs($this->owner)->get(route('qr.show'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('qr/poster')
            ->where('business.rotate_qr_daily', false)
            ->where('join.url', route('queue.join', ['business' => $this->business->slug, 'k' => $this->business->qr_token]))
            ->where('join.image', fn (string $image) => str_starts_with($image, 'data:image/svg+xml;base64,')));
});

test('the TV display page shows the owner their TV link', function () {
    $this->actingAs($this->owner)->get(route('display.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('display/settings')
            ->where('displayUrl', route('display.show', $this->business->display_token)));
});

test('resetting the TV link makes the old one stop working', function () {
    $old = $this->business->display_token;

    $this->actingAs($this->owner)->post(route('display.reset'))->assertRedirect(route('display.edit'));

    $new = $this->business->fresh()->display_token;
    expect($new)->not->toBe($old);
    $this->get(route('display.state', $old))->assertNotFound();
    $this->get(route('display.state', $new))->assertOk();
});

test('owners only ever see and reset their own links', function () {
    $other = User::factory()->owner()->create();
    $before = $this->business->display_token;

    $this->actingAs($other)->post(route('display.reset'));
    $this->actingAs($other)->get(route('display.edit'))
        ->assertInertia(fn (Assert $page) => $page->where('displayUrl', fn (string $url) => ! str_contains($url, $before)));

    expect($this->business->fresh()->display_token)->toBe($before);
});

test('guests are sent to log in', function (string $method, string $route) {
    $this->{$method}(route($route))->assertRedirect(route('login'));
})->with([
    ['get', 'qr.show'],
    ['get', 'display.edit'],
    ['post', 'display.reset'],
]);

test('turning on the nightly QR change starts counting from today', function () {
    $this->business->forceFill(['qr_token_date' => now()->subDays(5)->toDateString()])->save();

    $this->business->update(['rotate_qr_daily' => true]);

    expect($this->business->fresh()->qr_token_date->toDateString())->toBe($this->business->today());
});

test('each new shop gets its own TV link', function () {
    expect(Business::factory()->count(3)->create()->pluck('display_token')->unique())->toHaveCount(3);
});
