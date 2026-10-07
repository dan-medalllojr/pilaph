<?php

namespace App\Http\Controllers\Owner;

use App\Http\Requests\Owner\StorePushSubscriptionRequest;
use App\Notifications\OwnerAlerts\TestAlert;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;

/**
 * Turns push alerts on or off for one of the owner's devices.
 */
class PushSubscriptionController extends OwnerController
{
    public function store(StorePushSubscriptionRequest $request): RedirectResponse
    {
        $this->owner($request)->updatePushSubscription(
            $request->string('endpoint')->value(),
            $request->string('keys.p256dh')->value(),
            $request->string('keys.auth')->value(),
            $request->input('content_encoding') ?? 'aesgcm',
        );

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Alerts are on for this device.')]);

        return back();
    }

    public function destroy(Request $request): RedirectResponse
    {
        $request->validate(['endpoint' => ['required', 'string']]);

        // Only ever the owner's own subscription.
        $this->owner($request)->deletePushSubscription($request->string('endpoint')->value());

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Alerts are off for this device.')]);

        return back();
    }

    public function test(Request $request): RedirectResponse
    {
        $owner = $this->owner($request);
        $owner->notify(new TestAlert);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Test alert sent. It should appear in a few seconds.')]);

        return back();
    }
}
