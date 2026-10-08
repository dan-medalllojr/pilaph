<?php

namespace App\Http\Controllers\Customer;

use App\Actions\CreateTicket;
use App\Http\Controllers\Controller;
use App\Http\Requests\Customer\JoinQueueRequest;
use App\Models\Business;
use App\Models\Ticket;
use App\Services\PlanUsage;
use App\Services\PublicQueueState;
use App\Services\ShopPhotos;
use App\Support\PhilippinePhone;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The page customers reach by scanning the shop's QR code.
 */
class JoinController extends Controller
{
    /** Long-lived random ID so one phone can't hold two tickets at once. */
    private const DEVICE_COOKIE = 'pilaph_device';

    private const DEVICE_COOKIE_MINUTES = 60 * 24 * 365 * 2;

    public function show(Request $request, Business $business, PublicQueueState $queueState, ShopPhotos $photos, PlanUsage $usage): Response
    {
        $deviceId = $this->deviceId($request);
        $token = $request->string('k')->value();

        $existing = Ticket::query()
            ->where('business_id', $business->id)
            ->where('queue_date', $business->today())
            ->active()
            ->where('device_id', $deviceId)
            ->first(['id', 'code']);

        return Inertia::render('public/join', [
            'queue' => $queueState->forBusiness($business),
            // Echoed back only when valid, so the form can submit it.
            'qrToken' => $token !== '' && hash_equals($business->qr_token, $token) ? $token : null,
            'existingTicket' => $existing?->only(['id', 'code']),
            // Kept when a paid plan ends, but shown again only after renewing.
            'photoUrl' => $business->limits()->photo ? $photos->url($business) : null,
            // No texts on the shop's plan (or none left this month): no phone field.
            'textsEnabled' => $usage->textsLeft($business) > 0,
            'branding' => $business->limits()->branding,
        ]);
    }

    public function store(JoinQueueRequest $request, Business $business, CreateTicket $createTicket): RedirectResponse
    {
        $ticket = $createTicket->execute(
            business: $business,
            serviceId: $request->integer('service_id'),
            customerName: $request->string('customer_name')->trim()->value(),
            phone: PhilippinePhone::normalize($request->string('phone')->value()),
            idempotencyKey: $request->string('idempotency_key')->value(),
            deviceId: $this->deviceId($request),
            qrToken: $request->filled('k') ? $request->string('k')->value() : null,
        );

        return to_route('tickets.show', $ticket);
    }

    /**
     * The visitor's device ID, issuing one (as a cookie) on their first visit.
     */
    private function deviceId(Request $request): string
    {
        $deviceId = $request->cookie(self::DEVICE_COOKIE);

        if (! is_string($deviceId) || strlen($deviceId) !== 40) {
            $deviceId = Str::random(40);
            // Remember it on this request too, so show() and store() agree.
            $request->cookies->set(self::DEVICE_COOKIE, $deviceId);
            Cookie::queue(self::DEVICE_COOKIE, $deviceId, self::DEVICE_COOKIE_MINUTES);
        }

        return $deviceId;
    }
}
