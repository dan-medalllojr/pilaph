<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

/**
 * Many visitors share the demo account, so none of them can lock the others
 * out or reach a real inbox or phone: no password, email, two-factor or
 * passkey changes, no account deletion, no push alerts and no photo uploads.
 * Everything else about the sample shop can be tried; it resets every hour.
 */
class ProtectDemoAccount
{
    private const BLOCKED_ROUTES = [
        'profile.update',
        'profile.destroy',
        'user-password.update',
        'verification.send',
        'two-factor.enable',
        'two-factor.confirm',
        'two-factor.disable',
        'two-factor.regenerate-recovery-codes',
        'passkey.registration-options',
        'passkey.store',
        'passkey.destroy',
        'push-subscriptions.store',
        // Anyone could put any picture on the public demo's join page.
        'business.photo.store',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user instanceof User && $user->isDemo() && $request->routeIs(...self::BLOCKED_ROUTES)) {
            $message = __("The demo can't change this. Sign up to set up your own shop.");

            if ($request->expectsJson() && ! $request->header('X-Inertia')) {
                return response()->json(['message' => $message], 403);
            }

            Inertia::flash('toast', ['type' => 'error', 'message' => $message]);

            return back();
        }

        return $next($request);
    }
}
