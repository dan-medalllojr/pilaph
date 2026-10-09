<?php

use App\Models\Business;
use App\Models\User;

test('every page forbids framing and type guessing, and keeps addresses to itself', function (string $path) {
    $response = $this->get($path);

    $response->assertHeader('X-Frame-Options', 'DENY')
        ->assertHeader('Content-Security-Policy', "frame-ancestors 'none'")
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
})->with([
    'landing page' => '/',
    'health check' => '/up',
    'a page that does not exist' => '/no-such-page',
]);

test('the owner dashboard can\'t be shown in another site\'s frame', function () {
    $owner = User::factory()->owner()->create();

    $this->actingAs($owner)->get(route('dashboard'))
        ->assertOk()
        ->assertHeader('X-Frame-Options', 'DENY');
});

test('the customer pages and their live state have them too', function () {
    $business = Business::factory()->create();

    $this->get(route('queue.join', $business))->assertHeader('X-Frame-Options', 'DENY');
    $this->get(route('queue.state', $business))->assertHeader('X-Content-Type-Options', 'nosniff');
});

test('over HTTPS, browsers are told to stay on HTTPS; never over plain HTTP', function () {
    $this->get('https://localhost/')->assertHeader('Strict-Transport-Security', 'max-age=31536000');
    $this->get('http://localhost/')->assertHeaderMissing('Strict-Transport-Security');
});
