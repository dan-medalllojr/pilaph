<?php

namespace App\Actions;

use App\Exceptions\GoogleSignInFailed;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Socialite\Two\User as GoogleAccount;

/**
 * Finds the owner account for a Google sign-in, linking or creating it.
 *
 * Google has checked the email address, so an existing verified account with
 * the same email belongs to the same person and gets linked. An unverified one
 * doesn't: whoever made it never proved they own the email, and linking it
 * would let them back in later with its password.
 */
class FindOrCreateGoogleOwner
{
    public function execute(GoogleAccount $google): User
    {
        $email = $google->getEmail();
        $emailVerified = filter_var($google->getRaw()['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if (! is_string($email) || $email === '' || ! $emailVerified) {
            throw new GoogleSignInFailed(__('Your Google account needs a verified email address.'));
        }

        $googleId = (string) $google->getId();

        $user = User::query()->where('google_id', $googleId)->first()
            ?? DB::transaction(fn () => $this->linkOrCreate($googleId, $email, $google->getName()));

        if ($user->wasRecentlyCreated) {
            event(new Registered($user));
        }

        return $user;
    }

    private function linkOrCreate(string $googleId, string $email, ?string $name): User
    {
        $user = User::query()
            ->whereRaw('lower(email) = ?', [Str::lower($email)])
            ->lockForUpdate()
            ->first();

        if ($user === null) {
            $user = new User;
            $user->forceFill([
                'name' => Str::limit(filled($name) ? $name : Str::before($email, '@'), 255, ''),
                'email' => $email,
                'google_id' => $googleId,
                // Google has checked it, so no need to send our own link.
                'email_verified_at' => now(),
            ])->save();

            return $user;
        }

        if ($user->google_id !== null) {
            throw new GoogleSignInFailed(__('This email is already linked to a different Google account.'));
        }

        if (! $user->hasVerifiedEmail()) {
            throw new GoogleSignInFailed(__('An account with this email is waiting to be verified. Log in with your password and verify your email first.'));
        }

        $user->forceFill(['google_id' => $googleId])->save();

        return $user;
    }
}
