<?php

namespace App\Support;

use App\Http\Controllers\Auth\GoogleController;

/**
 * Whether emails and texts actually reach people. In production without an
 * email service (MAIL_MAILER=log) or an SMS service (SMS_DRIVER=log), nothing
 * is delivered, so the app stops promising it: no email sign-up (Google
 * only), no password reset by email, no email change, and no phone field or
 * texts. On a developer's computer both stay on, writing to the log, unless
 * MESSAGING_LIKE_PRODUCTION is on.
 */
final class Messaging
{
    public static function canEmail(): bool
    {
        return ! self::likeProduction() || ! in_array(config('mail.default'), ['log', 'array'], true);
    }

    public static function canText(): bool
    {
        return ! self::likeProduction() || config('services.sms.driver') !== 'log';
    }

    /**
     * Signing up with email and password needs a confirmation email; without
     * one, owners sign up with Google (if Google isn't set up either, the
     * email form stays, so there is still a way in).
     */
    public static function emailSignUpOpen(): bool
    {
        return self::canEmail() || ! GoogleController::isConfigured();
    }

    private static function likeProduction(): bool
    {
        return app()->isProduction() || (bool) config('app.messaging_like_production');
    }
}
