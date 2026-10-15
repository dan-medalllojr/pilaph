<?php

namespace App\Http\Controllers\Owner;

use App\Actions\ActivatePlan;
use App\Enums\PaymentStatus;
use App\Enums\Plan;
use App\Models\Business;
use App\Models\PlanPayment;
use App\Services\HitPay;
use App\Services\PlanUsage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Plan & billing: the shop's plan, this month's usage, and paying for a
 * plan: by QR Ph through HitPay when it's set up, else by sending GCash or
 * Maya and the admin running `php artisan plan:set`.
 */
class PlanController extends OwnerController
{
    public function show(Request $request, PlanUsage $usage, HitPay $hitPay, ActivatePlan $activate): Response
    {
        $business = $this->business($request);
        Gate::authorize('view', $business);

        $payments = $business->planPayments()->latest()->limit(20)->get();
        $pending = $payments->first(fn (PlanPayment $payment) => $payment->status === PaymentStatus::Pending
            && $payment->checkout_url !== null
            && $payment->created_at?->isAfter(now()->subDay()));

        return Inertia::render('plan/show', [
            'summary' => $usage->summary($business),
            'plans' => Plan::catalog(),
            'trial' => Business::trialOffer(),
            // Pay by QR Ph in the app (HitPay is set up).
            'online' => $hitPay->configured(),
            'options' => $hitPay->configured() ? $this->options($business, $activate) : [],
            'pending' => $pending !== null ? [
                'plan' => $pending->plan->label(),
                'months' => $pending->months,
                'amount' => $pending->amount,
                'checkout_url' => $pending->checkout_url,
                'check_url' => route('plan.payments.show', $pending),
            ] : null,
            'history' => array_values($payments
                ->where('status', PaymentStatus::Paid)
                ->map(fn (PlanPayment $payment) => [
                    'id' => $payment->id,
                    'plan' => $payment->plan->label(),
                    'months' => $payment->months,
                    'amount' => $payment->amount,
                    'paid_at' => $payment->paid_at?->toIso8601String(),
                    'plan_ends_at' => $payment->plan_ends_at?->toIso8601String(),
                ])
                ->all()),
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

    /**
     * Each paid plan and number of months: the price, and when the plan
     * would end if paid now (or why it can't be bought now).
     *
     * @return list<array{plan: string, months: int, amount: int, ends_at: string, refusal: string|null}>
     */
    private function options(Business $business, ActivatePlan $activate): array
    {
        $options = [];
        foreach ([Plan::Basic, Plan::Pro] as $plan) {
            foreach ((array) config('plans.months') as $months) {
                $options[] = [
                    'plan' => $plan->value,
                    'months' => (int) $months,
                    'amount' => $plan->price() * (int) $months,
                    'ends_at' => $activate->endsAt($business, $plan, (int) $months)->toIso8601String(),
                    'refusal' => $activate->refusal($business, $plan, (int) $months),
                ];
            }
        }

        return $options;
    }
}
