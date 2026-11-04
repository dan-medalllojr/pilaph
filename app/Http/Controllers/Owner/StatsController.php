<?php

namespace App\Http\Controllers\Owner;

use App\Services\ShopStats;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class StatsController extends OwnerController
{
    public function show(Request $request, ShopStats $stats): Response|RedirectResponse
    {
        $business = $this->business($request);
        Gate::authorize('view', $business);

        $validated = $request->validate(['days' => ['nullable', 'integer', Rule::in(ShopStats::PERIODS)]]);
        $days = (int) ($validated['days'] ?? 7);

        // Longer periods come with longer history (a paid plan).
        if ($days > $business->limits()->historyDays) {
            Inertia::flash('toast', [
                'type' => 'info',
                'message' => __('Stats for longer periods come with the Basic and Pro plans.'),
            ]);

            return to_route('plan.show');
        }

        return Inertia::render('stats', [
            'stats' => $stats->forBusiness($business, $days),
            'periods' => $stats->periodsFor($business),
        ]);
    }
}
