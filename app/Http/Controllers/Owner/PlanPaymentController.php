<?php

namespace App\Http\Controllers\Owner;

use App\Actions\CompletePlanPayment;
use App\Actions\StartPlanPayment;
use App\Enums\PaymentStatus;
use App\Enums\Plan;
use App\Http\Requests\Owner\StorePlanPaymentRequest;
use App\Models\PlanPayment;
use App\Services\HitPay;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

/**
 * Paying for a plan by QR Ph: start the payment and send the owner to
 * HitPay's checkout, then check it when HitPay sends them back.
 */
class PlanPaymentController extends OwnerController
{
    public function store(StorePlanPaymentRequest $request, StartPlanPayment $start, HitPay $hitPay): Response
    {
        abort_unless($hitPay->configured(), 404);

        $payment = $start->execute(
            $this->business($request),
            $this->owner($request),
            Plan::from($request->string('plan')->value()),
            $request->integer('months'),
        );

        // HitPay's own page, outside the app.
        return Inertia::location((string) $payment->checkout_url);
    }

    /**
     * Where HitPay sends the owner back. Its query string (status=completed)
     * could be typed by anyone, so ask HitPay itself; the webhook may also
     * have switched the plan on already.
     */
    public function show(Request $request, PlanPayment $payment, HitPay $hitPay, CompletePlanPayment $complete): RedirectResponse
    {
        abort_unless($payment->business_id === $this->business($request)->id, 404);

        if ($payment->status === PaymentStatus::Pending && $payment->hitpay_request_id !== null && $hitPay->configured()) {
            try {
                $complete->execute($payment, $hitPay->paymentRequest($payment->hitpay_request_id));
            } catch (RequestException|ConnectionException) {
                // HitPay's webhook will still switch the plan on.
            }
        }

        $business = $payment->business->refresh();

        Inertia::flash('toast', match ($payment->status) {
            PaymentStatus::Paid => [
                'type' => 'success',
                'message' => __('Payment received. Your shop is on :plan until :date.', [
                    'plan' => $payment->plan->label(),
                    'date' => $payment->plan_ends_at?->setTimezone($business->timezone)->format('M j, Y'),
                ]),
            ],
            PaymentStatus::Failed => ['type' => 'error', 'message' => __("The payment didn't go through. You can try again.")],
            PaymentStatus::Pending => ['type' => 'info', 'message' => __("We haven't received this payment yet. If you paid, it shows here within a few minutes.")],
        });

        return to_route('plan.show');
    }
}
