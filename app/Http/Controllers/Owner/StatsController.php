<?php

namespace App\Http\Controllers\Owner;

use App\Services\ShopStats;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class StatsController extends OwnerController
{
    public function show(Request $request, ShopStats $stats): Response
    {
        $business = $this->business($request);
        Gate::authorize('view', $business);

        $validated = $request->validate(['days' => ['nullable', 'integer', Rule::in(ShopStats::PERIODS)]]);

        return Inertia::render('stats', [
            'stats' => $stats->forBusiness($business, (int) ($validated['days'] ?? 7)),
        ]);
    }
}
