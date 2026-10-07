<?php

use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Fortify\Features;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;
use Laravel\Socialite\Two\User as GoogleAccount;

beforeEach(function () {
    config([
        'services.google.client_id' => 'test-client-id',
        'services.google.client_secret' => 'test-client-secret',
    ]);
});

/**
 * Pretend Google sent back this account. Nothing reaches Google.
 *
 * @param  array<string, mixed>  $attributes
 */
function googleReturns(array $attributes = []): void
{
    Socialite::fake('google', GoogleAccount::fake([
        'id' => '1234567890',
        'name' => 'Juan dela Cruz',
        'email' => 'juan@gmail.com',
        'email_verified' => true,
        ...$attributes,
    ]));
}

function toastMessage(): ?string
{
    $toast = session('inertia.flash_data.toast');

    return is_array($toast) ? $toast['message'] : null;
}

test('login and register pages offer Google only when it is set up', function (?string $clientId, bool $shown) {
    config(['services.google.client_id' => $clientId]);

    $this->get(route('login'))->assertInertia(fn (Assert $page) => $page->where('canSignInWithGoogle', $shown));
    $this->get(route('register'))->assertInertia(fn (Assert $page) => $page->where('canSignInWithGoogle', $shown));
    $this->get(route('google.redirect'))->assertStatus($shown ? 302 : 404);
})->with([
    'set up' => ['test-client-id', true],
    'not set up' => [null, false],
]);

test('the Google button sends the owner to Google', function () {
    googleReturns();

    $this->get(route('google.redirect'))->assertRedirect('https://socialite.fake/google/authorize');
});

test('starting from another address switches to APP_URL first, where Google will send them back', function (string $from, ?string $bouncedTo) {
    config(['app.url' => 'http://localhost:8100']);
    googleReturns();

    $response = $this->get($from);

    $bouncedTo === null
        ? $response->assertRedirect('https://socialite.fake/google/authorize')
        : $response->assertRedirect($bouncedTo);
})->with([
    '127.0.0.1 instead of localhost' => ['http://127.0.0.1:8100/auth/google', 'http://localhost:8100/auth/google'],
    'another port' => ['http://localhost:8101/auth/google', 'http://localhost:8100/auth/google'],
    'APP_URL itself' => ['http://localhost:8100/auth/google', null],
]);

test('a production APP_URL without a port compares only the host', function () {
    config(['app.url' => 'https://pilaph.example']);
    googleReturns();

    // Behind Railway's proxy the request may arrive as http on port 80.
    $this->get('http://pilaph.example/auth/google')->assertRedirect('https://socialite.fake/google/authorize');
    $this->get('https://pilaph-production.up.railway.app/auth/google')->assertRedirect('https://pilaph.example/auth/google');
});

test('a new owner signs up with Google: verified, no password, straight to shop setup', function () {
    Event::fake([Registered::class]);
    googleReturns(['email' => 'Juan@Gmail.com']);

    $this->get(route('google.callback'))->assertRedirect(route('dashboard'));

    $user = User::sole();
    $this->assertAuthenticatedAs($user);
    expect($user->name)->toBe('Juan dela Cruz')
        ->and($user->email)->toBe('Juan@Gmail.com')
        ->and($user->google_id)->toBe('1234567890')
        ->and($user->hasVerifiedEmail())->toBeTrue()
        ->and($user->hasPassword())->toBeFalse();
    Event::assertDispatched(Registered::class);

    $this->get(route('dashboard'))->assertRedirect(route('business.setup'));
});

test('a returning owner is found by Google ID even after changing their Gmail', function () {
    $owner = User::factory()->owner()->withGoogle()->create(['google_id' => '1234567890', 'email' => 'old@gmail.com']);
    googleReturns(['email' => 'new@gmail.com']);

    $this->get(route('google.callback'))->assertRedirect(route('dashboard'));

    $this->assertAuthenticatedAs($owner);
    expect(User::count())->toBe(1);
});

test('signing in with Google links an existing verified account with the same email', function () {
    $owner = User::factory()->owner()->create(['email' => 'juan@gmail.com']);
    googleReturns(['email' => 'JUAN@gmail.com']);

    $this->get(route('google.callback'))->assertRedirect(route('dashboard'));

    $this->assertAuthenticatedAs($owner);
    expect($owner->fresh()->google_id)->toBe('1234567890')
        ->and($owner->fresh()->hasPassword())->toBeTrue()
        ->and(User::count())->toBe(1);
});

test('Google sign-in is refused', function (Closure $setUp, array $google, string $message) {
    $setUp();
    googleReturns($google);
    $usersBefore = User::query()->pluck('google_id', 'id')->all();

    $this->get(route('google.callback'))->assertRedirect(route('login'));

    $this->assertGuest();
    expect(toastMessage())->toBe($message)
        ->and(User::query()->pluck('google_id', 'id')->all())->toBe($usersBefore);
})->with([
    // Linking would let whoever made the unverified account back in with its password.
    'for an unverified account with that email' => [
        fn () => User::factory()->unverified()->create(['email' => 'juan@gmail.com']),
        [],
        'An account with this email is waiting to be verified. Log in with your password and verify your email first.',
    ],
    'for an email linked to another Google account' => [
        fn () => User::factory()->withGoogle()->create(['email' => 'juan@gmail.com', 'google_id' => '999']),
        [],
        'This email is already linked to a different Google account.',
    ],
    'when Google has not verified the email' => [
        fn () => null,
        ['email_verified' => false],
        'Your Google account needs a verified email address.',
    ],
    'when Google sends no email' => [
        fn () => null,
        ['email' => null],
        'Your Google account needs a verified email address.',
    ],
]);

test('pressing Cancel on Google goes back to the login page quietly', function () {
    $this->get(route('google.callback', ['error' => 'access_denied']))->assertRedirect(route('login'));

    $this->assertGuest();
    expect(toastMessage())->toBeNull();
});

test('an expired or replayed sign-in shows a friendly error', function () {
    Socialite::fake('google', fn () => throw new InvalidStateException);

    $this->get(route('google.callback'))->assertRedirect(route('login'));

    $this->assertGuest();
    expect(toastMessage())->toBe("Google sign-in didn't finish. Please try again.");
});

test('owners with two-factor codes still enter one after Google', function () {
    Features::twoFactorAuthentication(['confirm' => true, 'confirmPassword' => true]);
    $owner = User::factory()->owner()->withGoogle()->withTwoFactor()->create(['google_id' => '1234567890']);
    googleReturns();

    $this->get(route('google.callback'))->assertRedirect(route('two-factor.login'));

    $this->assertGuest();
    expect(session('login.id'))->toBe($owner->id);
});

test('a Google-only owner cannot log in with a password', function () {
    $owner = User::factory()->owner()->withGoogle()->create();

    $this->post(route('login'), ['email' => $owner->email, 'password' => 'password']);

    $this->assertGuest();
});

describe('confirming it is you', function () {
    test('the confirm page offers Google, and hides the password form for Google-only owners', function () {
        $owner = User::factory()->owner()->withGoogle()->create();

        $this->actingAs($owner)->get(route('password.confirm'))
            ->assertInertia(fn (Assert $page) => $page
                ->component('auth/confirm-password')
                ->where('hasPassword', false)
                ->where('canConfirmWithGoogle', true));
    });

    test('password owners without Google see only the usual options', function () {
        $owner = User::factory()->owner()->create();

        $this->actingAs($owner)->get(route('password.confirm'))
            ->assertInertia(fn (Assert $page) => $page
                ->where('hasPassword', true)
                ->where('canConfirmWithGoogle', false));
    });

    test('the same Google account confirms it and opens security settings', function () {
        $owner = User::factory()->owner()->withGoogle()->create(['google_id' => '1234567890']);
        googleReturns();

        $this->actingAs($owner)->get(route('security.edit'))->assertRedirect(route('password.confirm'));
        $this->get(route('google.callback'))->assertRedirect(route('security.edit'));

        $this->get(route('security.edit'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('hasPassword', false));
    });

    test('a different Google account does not confirm it', function () {
        $owner = User::factory()->owner()->withGoogle()->create(['google_id' => '555']);
        googleReturns(['id' => '1234567890']);

        $this->actingAs($owner)->get(route('google.callback'))->assertRedirect(route('password.confirm'));

        expect(session('auth.password_confirmed_at'))->toBeNull()
            ->and(toastMessage())->toBe('Use the Google account you sign in with.');
    });
});

describe('owners without a password', function () {
    test('can set their first password without a current one', function () {
        $owner = User::factory()->owner()->withGoogle()->create();

        $this->actingAs($owner)->put(route('user-password.update'), [
            'password' => 'a-new-password-123',
            'password_confirmation' => 'a-new-password-123',
        ])->assertSessionHasNoErrors();

        expect($owner->fresh()->hasPassword())->toBeTrue();
    });

    test('owners with a password still need the current one to change it', function () {
        $owner = User::factory()->owner()->withGoogle()->create(['password' => 'password']);

        $this->actingAs($owner)->put(route('user-password.update'), [
            'password' => 'a-new-password-123',
            'password_confirmation' => 'a-new-password-123',
        ])->assertSessionHasErrors('current_password');
    });

    test('confirm with Google before deleting their account', function () {
        $owner = User::factory()->owner()->withGoogle()->create();

        $this->actingAs($owner)->get(route('profile.edit'))
            ->assertInertia(fn (Assert $page) => $page->where('hasPassword', false));

        $this->delete(route('profile.destroy'))->assertRedirect(route('password.confirm'));
        expect($owner->fresh())->not->toBeNull();

        $this->withSession(['auth.password_confirmed_at' => now()->unix()])
            ->delete(route('profile.destroy'))->assertRedirect('/');
        expect($owner->fresh())->toBeNull();
    });
});
