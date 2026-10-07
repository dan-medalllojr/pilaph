<?php

namespace App\Http\Controllers\Owner;

use App\Actions\ResetDisplayLink;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class DisplaySettingsController extends OwnerController
{
    public function edit(Request $request): Response
    {
        $business = $this->business($request);
        Gate::authorize('update', $business);

        return Inertia::render('display/settings', [
            'displayUrl' => route('display.show', $business->display_token),
        ]);
    }

    public function reset(Request $request, ResetDisplayLink $resetLink): RedirectResponse
    {
        $business = $this->business($request);
        Gate::authorize('update', $business);

        $resetLink->execute($business);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('New TV link ready. Open it on your TV.')]);

        return to_route('display.edit');
    }
}
