<?php

namespace App\Http\Controllers\Owner;

use App\Enums\Plan;
use App\Models\Business;
use App\Services\PlanUsage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Plan & billing: the shop's plan, this month's usage, and how to pay.
 * Payments are manual for now: the owner pays by GCash or Maya and the
 * plan is switched on with `php artisan plan:set`.
 */
class PlanController extends OwnerController
{
    public function show(Request $request, PlanUsage $usage): Response
    {
        $business = $this->business($request);
        Gate::authorize('view', $business);

        return Inertia::render('plan/show', [
            'summary' => $usage->summary($business),
            'plans' => Plan::catalog(),
            'trial' => Business::trialOffer(),
            'payment' => [
                'gcash' => config('plans.payment.gcash'),
                'maya' => config('plans.payment.maya'),
                'account_name' => config('plans.payment.account_name'),
                'contact' => config('plans.payment.contact'),
                // Put in the payment message, so it's matched to the right shop.
                'reference' => $business->slug,
            ],
        ]);
    }
}
