<?php

use App\Models\User;
use App\Notifications\OwnerAlerts\TestAlert;
use Illuminate\Support\Facades\Notification;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->owner = User::factory()->owner()->create();
});

/**
 * @return array<string, mixed>
 */
function subscriptionFor(string $endpoint): array
{
    return [
        'endpoint' => $endpoint,
        'keys' => ['p256dh' => 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'auth' => 'tBHItJI5svbpez7KI4CCXg'],
        'content_encoding' => 'aes128gcm',
    ];
}

test('an owner turns alerts on for a device', function (string $endpoint) {
    $this->actingAs($this->owner)
        ->post(route('push-subscriptions.store'), subscriptionFor($endpoint))
        ->assertSessionHasNoErrors();

    expect($this->owner->pushSubscriptions()->sole())
        ->endpoint->toBe($endpoint)
        ->auth_token->toBe('tBHItJI5svbpez7KI4CCXg');
})->with([
    'Chrome' => 'https://fcm.googleapis.com/fcm/send/abc123',
    'Firefox' => 'https://updates.push.services.mozilla.com/wpush/v2/abc123',
    'Safari' => 'https://web.push.apple.com/QGx3Z',
    'Edge' => 'https://wns2-par02p.notify.windows.com/w/?token=abc',
]);

test('only real push services are accepted, so the server never calls a made-up address', function (string $endpoint) {
    $this->actingAs($this->owner)
        ->post(route('push-subscriptions.store'), subscriptionFor($endpoint))
        ->assertSessionHasErrors('endpoint');

    expect($this->owner->pushSubscriptions()->count())->toBe(0);
})->with([
    'internal address' => 'https://169.254.169.254/latest/meta-data',
    'look-alike host' => 'https://fcm.googleapis.com.attacker.example/send',
    'plain http' => 'http://fcm.googleapis.com/fcm/send/abc',
    'not a URL' => 'fcm.googleapis.com',
]);

test('turning alerts off removes only that device, and only the owner\'s own', function () {
    $other = User::factory()->owner()->create();
    $other->updatePushSubscription('https://fcm.googleapis.com/fcm/send/other');
    $this->owner->updatePushSubscription('https://fcm.googleapis.com/fcm/send/mine');
    $this->owner->updatePushSubscription('https://fcm.googleapis.com/fcm/send/tablet');

    $this->actingAs($this->owner)->delete(route('push-subscriptions.destroy'), ['endpoint' => 'https://fcm.googleapis.com/fcm/send/mine']);
    $this->actingAs($this->owner)->delete(route('push-subscriptions.destroy'), ['endpoint' => 'https://fcm.googleapis.com/fcm/send/other']);

    expect($this->owner->pushSubscriptions()->pluck('endpoint')->all())->toBe(['https://fcm.googleapis.com/fcm/send/tablet'])
        ->and($other->pushSubscriptions()->count())->toBe(1);
});

test('a test alert goes to the owner', function () {
    Notification::fake();

    $this->actingAs($this->owner)->post(route('push-subscriptions.test'))
        ->assertSessionHas('inertia.flash_data.toast');

    Notification::assertSentTo($this->owner, TestAlert::class);
});

test('guests and owners without a shop cannot subscribe', function () {
    $this->post(route('push-subscriptions.store'), subscriptionFor('https://fcm.googleapis.com/fcm/send/x'))
        ->assertRedirect(route('login'));

    $noShop = User::factory()->create();
    $this->actingAs($noShop)->post(route('push-subscriptions.store'), subscriptionFor('https://fcm.googleapis.com/fcm/send/x'))
        ->assertRedirect(route('business.setup'));
});

test('the alerts page says which alerts the shop settings allow', function () {
    config(['webpush.vapid.public_key' => 'BPublicKey']);
    $this->owner->business->update(['max_waiting' => 20]);
    $this->owner->updatePushSubscription('https://fcm.googleapis.com/fcm/send/mine');

    $this->actingAs($this->owner)->get(route('alerts.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/alerts')
            ->where('deviceCount', 1)
            ->where('hasMaxWaiting', true)
            ->where('hasCutoff', false)
            ->where('webPushKey', 'BPublicKey'));
});

test('guests never get the push key', function () {
    config(['webpush.vapid.public_key' => 'BPublicKey']);

    $this->get(route('login'))->assertInertia(fn (Assert $page) => $page->where('webPushKey', null));
});
