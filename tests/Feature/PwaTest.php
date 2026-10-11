<?php

use App\Models\Business;
use App\Models\User;

test('the manifest makes the owner dashboard installable', function () {
    $manifest = json_decode((string) file_get_contents(public_path('manifest.webmanifest')), true, flags: JSON_THROW_ON_ERROR);

    expect($manifest)->toMatchArray([
        'name' => 'PilaPH',
        'start_url' => '/dashboard',
        'display' => 'standalone',
    ]);

    foreach ($manifest['icons'] as $icon) {
        expect(public_path(ltrim($icon['src'], '/')))->toBeFile();
    }

    expect(collect($manifest['icons'])->pluck('purpose'))->toContain('maskable');
});

test('the service worker handles alerts', function () {
    $worker = (string) file_get_contents(public_path('sw.js'));

    expect($worker)->toContain("addEventListener('push'")
        ->toContain("addEventListener('notificationclick'");
});

test('owner pages link the manifest; customer pages and the TV do not', function () {
    $business = Business::factory()->create();
    $owner = User::factory()->owner()->create();

    $this->get(route('login'))->assertSee('rel="manifest"', false);
    $this->actingAs($owner)->get(route('dashboard'))->assertSee('rel="manifest"', false);

    auth()->logout();
    $this->get(route('queue.join', ['business' => $business, 'k' => $business->qr_token]))->assertDontSee('rel="manifest"', false);
    $this->get(route('display.show', $business->display_token))->assertDontSee('rel="manifest"', false);
});

test('pages carry a link preview card, without the join link\'s QR key', function () {
    $business = Business::factory()->create();

    expect(public_path('images/og-image.jpg'))->toBeFile();

    $this->get('/')
        ->assertSee('<meta property="og:title" content="PilaPH: no more crowded waiting areas">', false)
        ->assertSee('<meta property="og:image" content="'.asset('images/og-image.jpg').'">', false)
        ->assertSee('<meta name="twitter:card" content="summary_large_image">', false);

    $this->get(route('queue.join', ['business' => $business, 'k' => $business->qr_token]))
        ->assertSee('<meta property="og:url" content="'.route('queue.join', $business).'">', false);
});
