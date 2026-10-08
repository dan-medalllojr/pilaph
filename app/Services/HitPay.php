<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;

/**
 * HitPay's payment API (hitpayapp.com), for owners paying for a plan by
 * QR Ph (GCash, Maya and bank apps). The owner pays on HitPay's own
 * checkout page; HitPay then tells us by webhook, and we can also ask.
 */
class HitPay
{
    /**
     * How owners can pay (config services.hitpay.payment_methods): QR Ph
     * (`qrph_netbank`) unless HITPAY_PAYMENT_METHODS says otherwise.
     *
     * @return list<string>
     */
    public function paymentMethods(): array
    {
        return array_values(array_filter((array) config('services.hitpay.payment_methods'), is_string(...)));
    }

    public function configured(): bool
    {
        return filled(config('services.hitpay.api_key')) && filled(config('services.hitpay.salt'));
    }

    /**
     * Starts a payment on HitPay.
     *
     * @param  array<string, mixed>  $fields  amount, currency, reference_number, redirect_url, ...
     * @return array<string, mixed> HitPay's payment request: id, url (the checkout page), status, ...
     *
     * @throws RequestException when HitPay answers with an error status.
     * @throws ConnectionException when HitPay can't be reached or doesn't answer in time.
     */
    public function createPaymentRequest(array $fields): array
    {
        return (array) $this->request()->asForm()->post('/payment-requests', $fields)->throw()->json();
    }

    /**
     * A payment request as HitPay has it now (status: pending, completed, ...).
     *
     * @return array<string, mixed>
     *
     * @throws RequestException|ConnectionException
     */
    public function paymentRequest(string $id): array
    {
        return (array) $this->request()->get('/payment-requests/'.rawurlencode($id))->throw()->json();
    }

    /**
     * Whether a webhook really came from HitPay: its Hitpay-Signature header
     * is the HMAC-SHA256 of the raw body, keyed with the webhook's salt.
     */
    public function validSignature(string $body, ?string $signature): bool
    {
        $salt = config('services.hitpay.salt');

        return filled($salt) && filled($signature)
            && hash_equals(hash_hmac('sha256', $body, (string) $salt), (string) $signature);
    }

    private function request(): PendingRequest
    {
        $base = config('services.hitpay.sandbox')
            ? 'https://api.sandbox.hit-pay.com/v1'
            : 'https://api.hit-pay.com/v1';

        return Http::baseUrl($base)
            ->withHeaders([
                'X-BUSINESS-API-KEY' => (string) config('services.hitpay.api_key'),
                'X-Requested-With' => 'XMLHttpRequest',
            ])
            ->acceptJson()
            ->timeout(15);
    }
}
