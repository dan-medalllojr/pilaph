<?php

namespace App\Actions;

use App\Enums\PaymentStatus;
use App\Models\PlanPayment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * HitPay says a plan payment went through (its webhook, or our own check
 * when the owner comes back): switch the plan on. Safe to call again for
 * the same payment: it is only ever counted once.
 */
class CompletePlanPayment
{
    public function __construct(private ActivatePlan $activate) {}

    /**
     * @param  array<string, mixed>  $request  HitPay's payment request (from the webhook or the API).
     * @return bool true when this call switched the plan on.
     */
    public function execute(PlanPayment $payment, array $request): bool
    {
        if (! $this->matches($payment, $request)) {
            Log::warning('HitPay payment does not match the plan payment', ['payment' => $payment->id, 'hitpay' => $request['id'] ?? null]);

            return false;
        }

        if (($request['status'] ?? null) !== 'completed') {
            if (($request['status'] ?? null) === 'failed' && $payment->status === PaymentStatus::Pending) {
                $payment->update(['status' => PaymentStatus::Failed]);
            }

            return false;
        }

        return DB::transaction(function () use ($payment, $request): bool {
            $locked = PlanPayment::query()->lockForUpdate()->findOrFail($payment->id);
            if ($locked->status === PaymentStatus::Paid) {
                return false;
            }

            $endsAt = $this->activate->execute($locked->business, $locked->plan, $locked->months);

            $payments = $request['payments'] ?? [];
            $locked->update([
                'status' => PaymentStatus::Paid,
                'paid_at' => now(),
                'plan_ends_at' => $endsAt,
                'hitpay_payment_id' => is_array($payments) && isset($payments[0]['id']) ? (string) $payments[0]['id'] : null,
            ]);
            $payment->setRawAttributes($locked->getAttributes(), true);

            return true;
        });
    }

    /**
     * The payment HitPay describes is this one, for the full amount in pesos.
     *
     * @param  array<string, mixed>  $request
     */
    private function matches(PlanPayment $payment, array $request): bool
    {
        // HitPay writes amounts from ₱1,000 up with a thousands comma ("9,588.00").
        $raw = str_replace(',', '', (string) ($request['amount'] ?? ''));
        $amount = is_numeric($raw) ? number_format((float) $raw, 2, '.', '') : null;

        return ($request['id'] ?? null) === $payment->hitpay_request_id
            && $payment->hitpay_request_id !== null
            && ($request['reference_number'] ?? null) === $payment->id
            && strtoupper((string) ($request['currency'] ?? '')) === $payment->currency
            && $amount === $payment->amount;
    }
}
