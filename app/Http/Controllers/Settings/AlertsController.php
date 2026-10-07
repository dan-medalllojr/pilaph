<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AlertsController extends Controller
{
    /**
     * Push alerts on this device, and which ones the shop's settings allow.
     */
    public function edit(Request $request): Response
    {
        $user = $request->user();
        abort_unless($user instanceof User, 403);
        $business = $user->business;

        return Inertia::render('settings/alerts', [
            'deviceCount' => $user->pushSubscriptions()->count(),
            'hasMaxWaiting' => $business?->max_waiting !== null,
            'hasCutoff' => $business?->join_cutoff_time !== null,
        ]);
    }
}
