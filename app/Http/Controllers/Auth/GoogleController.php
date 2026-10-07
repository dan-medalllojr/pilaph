<?php

namespace App\Http\Controllers\Auth;

use App\Actions\FindOrCreateGoogleOwner;
use App\Exceptions\GoogleSignInFailed;
use App\Http\Controllers\Controller;
use App\Models\User;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Laravel\Fortify\Events\TwoFactorAuthenticationChallenged;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\AbstractProvider;
use Laravel\Socialite\Two\InvalidStateException;
use Laravel\Socialite\Two\User as GoogleAccount;
use Symfony\Component\HttpFoundation\RedirectResponse as SymfonyRedirectResponse;

/**
 * "Continue with Google" for owners. A signed-in owner comes through here too,
 * to confirm it's them (in place of a password) before sensitive settings.
 */
class GoogleController extends Controller
{
    public static function isConfigured(): bool
    {
        return filled(config('services.google.client_id')) && filled(config('services.google.client_secret'));
    }

    public function redirect(Request $request): SymfonyRedirectResponse
    {
        abort_unless(self::isConfigured(), 404);

        // Google only sends people back to the addresses saved in Google Cloud
        // Console, which are APP_URL's. Opened at another one (127.0.0.1 instead
        // of localhost, or a second domain), start over at APP_URL.
        if (! $this->isAppUrl($request)) {
            return redirect()->away(rtrim((string) config('app.url'), '/').route('google.redirect', absolute: false));
        }

        $google = Socialite::driver('google');
        if ($google instanceof AbstractProvider) {
            // Always show Google's account picker: shop devices are often shared.
            $google->with(['prompt' => 'select_account']);
        }

        return $google->redirect();
    }

    public function callback(Request $request, FindOrCreateGoogleOwner $findOwner): RedirectResponse
    {
        abort_unless(self::isConfigured(), 404);

        $signedIn = $request->user();
        $retryUrl = $signedIn !== null ? route('password.confirm') : route('login');

        // The person pressed Cancel on Google's page.
        if ($request->filled('error')) {
            return redirect($retryUrl);
        }

        try {
            $google = Socialite::driver('google')->user();
        } catch (InvalidStateException) {
            // An expired or reused sign-in link, e.g. after pressing Back.
            return $this->failed($retryUrl, __("Google sign-in didn't finish. Please try again."));
        } catch (GuzzleException $e) {
            report($e);

            return $this->failed($retryUrl, __("Google sign-in didn't finish. Please try again."));
        }

        if (! $google instanceof GoogleAccount) {
            return $this->failed($retryUrl, __("Google sign-in didn't finish. Please try again."));
        }

        if ($signedIn !== null) {
            return $this->confirm($request, $signedIn, $google);
        }

        try {
            $owner = $findOwner->execute($google);
        } catch (GoogleSignInFailed $e) {
            return $this->failed($retryUrl, $e->getMessage());
        }

        // Owners who turned on two-factor codes still enter one, as with a password.
        if ($owner->hasEnabledTwoFactorAuthentication()) {
            $request->session()->put(['login.id' => $owner->getKey(), 'login.remember' => false]);
            TwoFactorAuthenticationChallenged::dispatch($owner);

            return redirect()->route('two-factor.login');
        }

        Auth::login($owner);
        $request->session()->regenerate();

        return redirect()->intended(route('dashboard'));
    }

    /**
     * Counts as confirming the password, for owners who sign in with Google.
     */
    private function confirm(Request $request, User $user, GoogleAccount $google): RedirectResponse
    {
        if ($user->google_id === null || $user->google_id !== (string) $google->getId()) {
            return $this->failed(route('password.confirm'), __('Use the Google account you sign in with.'));
        }

        $request->session()->passwordConfirmed();

        return redirect()->intended(route('dashboard'));
    }

    /**
     * Compares the host, and the port only when APP_URL names one, so a wrong
     * http/https in APP_URL can never cause a redirect loop.
     */
    private function isAppUrl(Request $request): bool
    {
        $appUrl = parse_url((string) config('app.url'));
        if (! is_array($appUrl) || ! isset($appUrl['host'])) {
            return true;
        }

        return strcasecmp($request->getHost(), $appUrl['host']) === 0
            && (! isset($appUrl['port']) || $request->getPort() === $appUrl['port']);
    }

    private function failed(string $url, string $message): RedirectResponse
    {
        Inertia::flash('toast', ['type' => 'error', 'message' => $message]);

        return redirect($url);
    }
}
