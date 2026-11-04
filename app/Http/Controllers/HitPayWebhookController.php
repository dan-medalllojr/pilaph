<?php

namespace App\Http\Controllers;

use App\Actions\CompletePlanPayment;
use App\Models\PlanPayment;
use App\Services\HitPay;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

/**
 * HitPay tells us a payment request was paid (payment_request.completed) or
 * failed. Registered in HitPay's dashboard under Developers > Webhooks.
 * Only a correctly signed body is believed.
 */
class HitPayWebhookController extends Controller
{
    public function __invoke(Request $request, HitPay $hitPay, CompletePlanPayment $complete): Response
    {
        $body = $request->getContent();
        abort_unless($hitPay->validSignature($body, $request->header('Hitpay-Signature')), 401);

        $data = json_decode($body, true);
        $reference = is_array($data) ? ($data['reference_number'] ?? null) : null;

        // Other payments on the same HitPay account aren't ours to handle.
        $payment = is_string($reference) && Str::isUuid($reference) ? PlanPayment::query()->find($reference) : null;
        if (is_array($data) && $payment !== null) {
            $complete->execute($payment, $data);
        }

        return response()->noContent();
    }
}
