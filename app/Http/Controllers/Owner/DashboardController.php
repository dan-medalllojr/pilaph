<?php

namespace App\Http\Controllers\Owner;

use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * For now a setup checklist; phase 5 turns this into the live queue view.
 */
class DashboardController extends OwnerController
{
    public function __invoke(Request $request): Response
    {
        $business = $this->business($request);

        return Inertia::render('dashboard', [
            'setup' => [
                'activeServices' => $business->services()->where('is_active', true)->count(),
                'activeCounters' => $business->counters()->where('is_active', true)->count(),
            ],
        ]);
    }
}
