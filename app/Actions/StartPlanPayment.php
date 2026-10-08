<?php

namespace App\Actions;

use App\Enums\PaymentStatus;
use App\Enums\Plan;
use App\Models\Business;
use App\Models\PlanPayment;
use App\Models\User;
use App\Services\HitPay;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * The owner chose a plan and how many months: record the payment and start
 * it on HitPay, whose checkout page shows the QR Ph code to scan.
 */
class StartPlanPayment
{
    public function __construct(
        private HitPay $hitPay,
        private ActivatePlan $activate,
    ) {}

    /**
     * @throws ValidationException when this plan can't be bought now, or HitPay can't start it.
     */
    public function execute(Business $business, User $owner, Plan $plan, int $months): PlanPayment
    {
        $refusal = $this->activate->refusal($business, $plan, $months);
        if ($refusal !== null) {
            throw ValidationException::withMessages(['plan' => $refusal]);
        }

        $payment = PlanPayment::create([
            'business_id' => $business->id,
            'user_id' => $owner->id,
            'plan' => $plan,
            'months' => $months,
            'amount' => number_format($plan->price() * $months, 2, '.', ''),
            'currency' => 'PHP',
            'status' => PaymentStatus::Pending,
        ]);

        try {
            $request = $this->hitPay->createPaymentRequest([
                'amount' => $payment->amount,
                'currency' => 'PHP',
                'payment_methods' => $this->hitPay->paymentMethods(),
                'purpose' => sprintf('PilaPH %s, %d %s: %s', $plan->label(), $months, $months === 1 ? 'month' : 'months', $business->name),
                'reference_number' => $payment->id,
                'email' => $owner->email,
                'name' => $owner->name,
                // Where HitPay sends the owner afterwards; we check the payment there.
                'redirect_url' => route('plan.payments.show', $payment),
            ]);
        } catch (RequestException|ConnectionException $exception) {
            $payment->update(['status' => PaymentStatus::Failed]);
            // HitPay's whole answer (its reason, e.g. a payment method not turned on); it never contains the API key.
            Log::warning('HitPay did not start a plan payment', [
                'payment' => $payment->id,
                'status' => $exception instanceof RequestException ? $exception->response->status() : null,
                'hitpay' => $exception instanceof RequestException ? mb_substr($exception->response->body(), 0, 2000) : $exception->getMessage(),
            ]);

            throw ValidationException::withMessages(['plan' => "Couldn't start the payment. Please try again in a moment."]);
        }

        if (! is_string($request['id'] ?? null) || ! is_string($request['url'] ?? null)) {
            $payment->update(['status' => PaymentStatus::Failed]);
            Log::warning('HitPay answered without a checkout page', ['payment' => $payment->id]);

            throw ValidationException::withMessages(['plan' => "Couldn't start the payment. Please try again in a moment."]);
        }

        $payment->update([
            'hitpay_request_id' => $request['id'],
            'checkout_url' => $request['url'],
        ]);

        return $payment;
    }
}
