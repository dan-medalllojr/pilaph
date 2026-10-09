<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $request->user(),
            ],
            // The signed-in owner's shop, for the sidebar. Never includes the QR token.
            'business' => fn () => $request->user()?->business?->only(['id', 'name', 'slug']),
            'demo' => fn () => [
                'enabled' => (bool) config('demo.enabled'),
                // Signed in as the shared demo owner (shows the demo banner).
                'active' => $request->user()?->isDemo() ?? false,
            ],
            // "Support the developer" on owner pages (config/support.php); not in the demo.
            'support' => function () use ($request) {
                $user = $request->user();
                $qr = config('support.qr_url');

                return $user?->business !== null && ! $user->isDemo() && is_string($qr) ? ['qr_url' => $qr] : null;
            },
            // Public by design: browsers need it to subscribe to push alerts.
            'webPushKey' => fn () => $request->user() !== null ? config('webpush.vapid.public_key') : null,
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }
}
