<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

/**
 * For the admin, while account emails can't be sent (no verified domain
 * yet): set someone's password by hand, and optionally mark their email as
 * verified so they aren't stuck on "verify your email".
 */
#[Signature('user:password {email : The account\'s email address} {--verify : Also mark the email address as verified}')]
#[Description('Set a new password for an account (when the reset email can\'t be sent)')]
class SetUserPassword extends Command
{
    public function handle(): int
    {
        $email = Str::lower(trim((string) $this->argument('email')));
        $user = User::query()->whereRaw('lower(email) = ?', [$email])->first();

        if ($user === null) {
            $this->components->error("No account uses {$email}.");

            return self::FAILURE;
        }

        if ($user->isDemo()) {
            $this->components->error("The demo account has no password on purpose; it's opened with the \"Try the demo\" button.");

            return self::FAILURE;
        }

        $password = (string) $this->secret('New password');
        $confirmation = (string) $this->secret('Type it again');

        $validator = Validator::make(
            ['password' => $password, 'password_confirmation' => $confirmation],
            ['password' => ['required', 'string', Password::defaults(), 'confirmed']],
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->components->error($message);
            }

            return self::FAILURE;
        }

        $user->forceFill([
            'password' => $password,
            // Signed-in browsers and "remember me" cookies stop working.
            'remember_token' => Str::random(60),
        ]);

        if ($this->option('verify') && $user->email_verified_at === null) {
            $user->email_verified_at = now();
        }

        $user->save();
        DB::table('sessions')->where('user_id', $user->id)->delete();

        $this->components->info("Password updated for {$user->email}. They were signed out everywhere and can now log in with it.");
        if ($this->option('verify')) {
            $this->components->info('Their email address is marked as verified.');
        }

        return self::SUCCESS;
    }
}
