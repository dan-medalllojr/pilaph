<?php

namespace App\Http\Controllers\Owner;

use App\Http\Requests\Owner\UpdateBusinessSettingsRequest;
use App\Services\ShopPhotos;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class BusinessSettingsController extends OwnerController
{
    public function edit(Request $request, ShopPhotos $photos): Response
    {
        $business = $this->business($request);
        Gate::authorize('update', $business);

        return Inertia::render('business/settings', [
            'business' => [
                'name' => $business->name,
                'slug' => $business->slug,
                'near_threshold' => $business->near_threshold,
                'max_waiting' => $business->max_waiting,
                // Postgres returns "21:30:00"; the time input wants "21:30".
                'join_cutoff_time' => $business->join_cutoff_time !== null
                    ? substr($business->join_cutoff_time, 0, 5)
                    : null,
                'rotate_qr_daily' => $business->rotate_qr_daily,
                'timezone' => $business->timezone,
            ],
            'joinUrl' => url("/q/{$business->slug}"),
            'photoUrl' => $photos->url($business),
            'photoAllowed' => $business->limits()->photo,
        ]);
    }

    public function update(UpdateBusinessSettingsRequest $request): RedirectResponse
    {
        $this->business($request)->update($request->validated());

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Shop settings saved.')]);

        return to_route('business.edit');
    }
}
