<?php

use App\Models\Business;
use App\Models\Service;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Inertia\Testing\AssertableInertia as Assert;

/**
 * Production with no email service (MAIL_MAILER=log) and no SMS service
 * (SMS_DRIVER=log): nothing promises an email or a text that never arrives.
 */
function productionWithoutEmailOrTexts(): void
{
    app()['env'] = 'production';
    // In "production" Laravel checks CSRF tokens even in tests; these forms carry none.
    test()->withoutMiddleware(PreventRequestForgery::class);
    config([
        'mail.default' => 'log',
        'services.sms.driver' => 'log',
        'services.google.client_id' => 'google-client',
        'services.google.client_secret' => 'google-secret',
    ]);
}

describe('without email', function () {
    beforeEach(fn () => productionWithoutEmailOrTexts());

    test('sign-up offers only Google', function () {
        $this->get(route('register'))->assertInertia(fn (Assert $page) => $page
            ->component('auth/register')
            ->where('canSignUpWithEmail', false)
            ->where('canSignInWithGoogle', true));
    });

    test('a hand-made email sign-up is refused', function () {
        $this->post(route('register.store'), [
            'name' => 'Juan',
            'email' => 'juan@example.com',
            'password' => 'A-very-long-Passw0rd!',
            'password_confirmation' => 'A-very-long-Passw0rd!',
        ])->assertSessionHasErrors(['email' => 'Sign up with your Google account.']);

        expect(User::where('email', 'juan@example.com')->exists())->toBeFalse();
    });

    test('log-in keeps email and password, without "Forgot your password?"', function () {
        $this->get(route('login'))->assertInertia(fn (Assert $page) => $page
            ->where('canResetPassword', false)
            ->where('canSignInWithGoogle', true));

        $this->get(route('password.request'))->assertInertia(fn (Assert $page) => $page->where('canEmail', false));
    });

    test('owners can\'t change their email, which they could no longer confirm', function () {
        $owner = User::factory()->owner()->create(['email' => 'owner@example.com']);

        $this->actingAs($owner)->get(route('profile.edit'))
            ->assertInertia(fn (Assert $page) => $page->where('canChangeEmail', false));

        $this->actingAs($owner)->patch(route('profile.update'), ['name' => 'New Name', 'email' => 'other@example.com'])
            ->assertSessionHasErrors('email');
        expect($owner->fresh())->email->toBe('owner@example.com')->email_verified_at->not->toBeNull();

        // Changing only the name still works.
        $this->actingAs($owner)->patch(route('profile.update'), ['name' => 'New Name', 'email' => 'owner@example.com'])
            ->assertSessionHasNoErrors();
        expect($owner->fresh()->name)->toBe('New Name');
    });

    test('without Google either, the email form stays, so there is still a way in', function () {
        config(['services.google.client_id' => null]);

        $this->get(route('register'))->assertInertia(fn (Assert $page) => $page->where('canSignUpWithEmail', true));
    });

    test('with an email service, everything is back', function () {
        config(['mail.default' => 'resend']);

        $this->get(route('register'))->assertInertia(fn (Assert $page) => $page->where('canSignUpWithEmail', true));
        $this->get(route('login'))->assertInertia(fn (Assert $page) => $page->where('canResetPassword', true));
    });
});

describe('without texts', function () {
    beforeEach(function () {
        productionWithoutEmailOrTexts();
        $this->business = Business::factory()->create();
        Service::factory()->for($this->business)->create();
    });

    test('the join page has no phone field and keeps no number', function () {
        $this->get(route('queue.join', $this->business))
            ->assertInertia(fn (Assert $page) => $page->where('textsEnabled', false));

        joinQueue($this->business, ['phone' => '0917 123 4567'])->assertSessionHasNoErrors();

        expect(Ticket::sole()->phone)->toBeNull();
    });

    test('the landing page doesn\'t promise texts', function () {
        $this->get(route('home'))->assertInertia(fn (Assert $page) => $page->where('textsAvailable', false));
    });

    test('with an SMS service, the phone field is back', function () {
        config(['services.sms.driver' => 'semaphore']);

        $this->get(route('queue.join', $this->business))
            ->assertInertia(fn (Assert $page) => $page->where('textsEnabled', true));
        $this->get(route('home'))->assertInertia(fn (Assert $page) => $page->where('textsAvailable', true));
    });
});

test('on a developer\'s computer, MESSAGING_LIKE_PRODUCTION shows what production shows', function () {
    config([
        'app.messaging_like_production' => true,
        'mail.default' => 'log',
        'services.sms.driver' => 'log',
        'services.google.client_id' => 'google-client',
        'services.google.client_secret' => 'google-secret',
    ]);
    $business = Business::factory()->create();

    $this->get(route('register'))->assertInertia(fn (Assert $page) => $page->where('canSignUpWithEmail', false));
    $this->get(route('login'))->assertInertia(fn (Assert $page) => $page->where('canResetPassword', false));
    $this->get(route('queue.join', $business))->assertInertia(fn (Assert $page) => $page->where('textsEnabled', false));
});

test('on a developer\'s computer, emails and texts go to the log, so everything stays on', function () {
    config(['mail.default' => 'log', 'services.sms.driver' => 'log']);
    $business = Business::factory()->create();

    $this->get(route('register'))->assertInertia(fn (Assert $page) => $page->where('canSignUpWithEmail', true));
    $this->get(route('queue.join', $business))->assertInertia(fn (Assert $page) => $page->where('textsEnabled', true));
});
