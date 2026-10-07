<?php

use App\Actions\ResetDemoShop;
use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Service;
use App\Models\Ticket;
use App\Models\User;
use App\Notifications\TicketCalled;
use App\Notifications\TicketNearTurn;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Notification;
use Inertia\Testing\AssertableInertia as Assert;

function demoOwner(): User
{
    return User::query()->where('email', config('demo.email'))->sole();
}

test('the demo shop has services, chairs, history and a live queue, but no phone numbers', function () {
    $this->artisan('demo:reset', ['--force' => true])->assertSuccessful();

    $shop = Business::query()->where('is_demo', true)->sole();
    $today = Ticket::query()->where('business_id', $shop->id)->where('queue_date', $shop->today());

    expect($shop->name)->toBe("Juan's Barbershop")
        ->and($shop->services()->count())->toBe(4)
        ->and($shop->counters()->count())->toBe(3)
        ->and((clone $today)->where('status', TicketStatus::Called)->count())->toBe(2)
        ->and((clone $today)->where('status', TicketStatus::Waiting)->count())->toBe(6)
        ->and($shop->tickets()->where('queue_date', '<', $shop->today())->count())->toBeGreaterThan(14 * 10)
        ->and($shop->tickets()->whereNotNull('phone')->count())->toBe(0)
        ->and(demoOwner()->business_id)->toBe($shop->id)
        ->and(demoOwner()->hasPassword())->toBeFalse();
});

test('a reset starts over and leaves real shops alone', function () {
    $realOwner = User::factory()->owner()->create();
    Ticket::factory()->for(Service::factory()->for($realOwner->business))->create();
    app(ResetDemoShop::class)->execute();
    $first = Business::query()->where('is_demo', true)->sole();
    $ownerId = demoOwner()->id;
    $first->update(['name' => 'Renamed by a visitor']);

    app(ResetDemoShop::class)->execute();

    expect(Business::query()->where('is_demo', true)->sole())
        ->id->not->toBe($first->id)
        ->name->toBe("Juan's Barbershop")
        ->and(demoOwner()->id)->toBe($ownerId)
        ->and($realOwner->business->fresh())->not->toBeNull()
        ->and($realOwner->business->tickets()->count())->toBe(1);
});

test('the reset runs hourly, and only while the demo is on', function () {
    $this->artisan('demo:reset')->assertSuccessful();
    expect(Business::query()->where('is_demo', true)->exists())->toBeFalse();

    $event = collect(app(Schedule::class)->events())->first(fn ($e) => str_contains((string) $e->command, 'demo:reset'));
    expect($event?->expression)->toBe('0 * * * *');
});

describe('with the demo on', function () {
    beforeEach(fn () => config(['demo.enabled' => true]));

    test('"Try the demo" signs in as the sample shop owner', function () {
        $this->post(route('demo.store'))->assertRedirect(route('dashboard'));

        $this->assertAuthenticatedAs(demoOwner());
        $this->get(route('dashboard'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('demo', ['enabled' => true, 'active' => true]));
    });

    test('leaving the demo signs out and opens sign-up', function () {
        $this->post(route('demo.store'));

        $this->post(route('demo.destroy'))->assertRedirect(route('register'));
        $this->assertGuest();
    });

    test('the demo account cannot be locked or pointed at a real inbox', function (string $method, string $route, array $data) {
        $this->post(route('demo.store'));
        $before = demoOwner()->only(['name', 'email', 'password', 'two_factor_secret']);

        $this->from(route('dashboard'))->{$method}(route($route), $data)
            ->assertRedirect(route('dashboard'))
            ->assertSessionHas('inertia.flash_data.toast', fn ($toast) => $toast['type'] === 'error');

        expect(demoOwner()->only(['name', 'email', 'password', 'two_factor_secret']))->toBe($before)
            ->and(demoOwner()->pushSubscriptions()->count())->toBe(0);
    })->with([
        'change email' => ['patch', 'profile.update', ['name' => 'Hacker', 'email' => 'hacker@example.com']],
        'set a password' => ['put', 'user-password.update', ['password' => 'a-new-password-123', 'password_confirmation' => 'a-new-password-123']],
        'delete the account' => ['delete', 'profile.destroy', []],
        'turn on two-factor' => ['post', 'two-factor.enable', []],
        'turn on push alerts' => ['post', 'push-subscriptions.store', ['endpoint' => 'https://fcm.googleapis.com/fcm/send/x', 'keys' => ['p256dh' => 'k', 'auth' => 'a']]],
    ]);

    test('passkey sign-up is refused too', function () {
        $this->post(route('demo.store'));

        $this->getJson(route('passkey.registration-options'))->assertForbidden();
    });

    test('the queue works, but the demo never texts anyone', function () {
        Notification::fake();
        $this->post(route('demo.store'));
        $shop = demoOwner()->business;
        // A visitor joins with their real number.
        Ticket::query()->where('business_id', $shop->id)->where('status', TicketStatus::Waiting)->update(['phone' => '639171234567']);
        $chair = $shop->counters()->orderBy('name')->get()[2];

        $this->post(route('dashboard.call-next', $chair), ['expected_current_ticket_id' => null])->assertSessionHasNoErrors();

        expect(Ticket::query()->where('counter_id', $chair->id)->where('status', TicketStatus::Called)->exists())->toBeTrue();
        Notification::assertNothingSentTo(Ticket::all(), TicketCalled::class);
        Notification::assertNothingSentTo(Ticket::all(), TicketNearTurn::class);
    });
});

test('with the demo off, there is no way in', function () {
    $this->post(route('demo.store'))->assertNotFound();
    $this->get(route('home'))->assertInertia(fn (Assert $page) => $page->where('demo.enabled', false));
});

test('the demo owner cannot be reached by password, and its email is reserved', function () {
    app(ResetDemoShop::class)->execute();

    $this->post(route('login'), ['email' => config('demo.email'), 'password' => '']);
    $this->assertGuest();

    $this->post(route('register.store'), [
        'name' => 'Sneaky',
        'email' => config('demo.email'),
        'password' => 'a-strong-password-123',
        'password_confirmation' => 'a-strong-password-123',
    ])->assertSessionHasErrors('email');
});

test('the landing page offers sign-up, and the demo when it is on', function () {
    config(['demo.enabled' => true]);

    $this->get(route('home'))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('welcome')->where('demo.enabled', true));
});
