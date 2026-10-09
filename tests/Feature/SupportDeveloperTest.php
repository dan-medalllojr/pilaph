<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('owner pages offer the support QR when it is set', function () {
    config(['support.qr_url' => '/images/support-qr.png']);
    $owner = User::factory()->owner()->create();

    foreach ([route('dashboard'), route('stats.show'), route('profile.edit')] as $page) {
        $this->actingAs($owner)->get($page)
            ->assertInertia(fn (Assert $inertia) => $inertia->where('support', ['qr_url' => '/images/support-qr.png']));
    }
});

test('it is hidden when no QR is set', function () {
    config(['support.qr_url' => null]);

    $this->actingAs(User::factory()->owner()->create())->get(route('dashboard'))
        ->assertInertia(fn (Assert $page) => $page->where('support', null));
});

test('the demo, visitors and owners without a shop don\'t see it', function () {
    config(['support.qr_url' => '/images/support-qr.png', 'demo.enabled' => true]);

    $this->post(route('demo.store'));
    $this->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page->where('support', null));
    $this->post(route('demo.destroy'));

    $this->get(route('home'))->assertInertia(fn (Assert $page) => $page->where('support', null));
    $this->actingAs(User::factory()->create())->get(route('business.setup'))
        ->assertInertia(fn (Assert $page) => $page->where('support', null));
});

test('an empty SUPPORT_QR_URL counts as not set', function () {
    putenv('SUPPORT_QR_URL=');
    $_ENV['SUPPORT_QR_URL'] = $_SERVER['SUPPORT_QR_URL'] = '';

    expect((require config_path('support.php'))['qr_url'])->toBeNull();
});
