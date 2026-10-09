<?php

namespace App\Actions;

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Ticket;
use App\Services\OwnerAlerts;
use App\Services\QueueEvents;
use App\Support\Messaging;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A customer joins the queue (Plan.md, key flow 1). Ticket numbers never
 * duplicate, and a repeated or racing submit never creates a second ticket.
 */
class CreateTicket
{
    public function __construct(
        private QueueEvents $events,
        private OwnerAlerts $alerts,
    ) {}

    /**
     * Returns the new ticket, or the customer's existing one when this is a
     * repeated submit or they already hold an active ticket here today.
     *
     * @param  string|null  $phone  Already normalized to 639XXXXXXXXX.
     *
     * @throws ValidationException when the shop isn't accepting this join.
     */
    public function execute(
        Business $business,
        int $serviceId,
        string $customerName,
        ?string $phone,
        string $idempotencyKey,
        string $deviceId,
        ?string $qrToken,
    ): Ticket {
        // 1. A repeated submit (double tap, slow network) returns the first result.
        $previous = $this->findByIdempotencyKey($business, $idempotencyKey);
        if ($previous !== null) {
            return $previous;
        }

        // 2. Only people who scanned the shop's current QR code may join.
        if ($qrToken === null || ! hash_equals($business->qr_token, $qrToken)) {
            $this->reject('k', 'Scan the QR code at the shop to join the queue.');
        }

        // Texts can't be sent: don't keep a number we'd never use.
        if (! Messaging::canText()) {
            $phone = null;
        }

        $waitingAfterJoin = 0;

        try {
            $ticket = DB::transaction(function () use ($business, $serviceId, $customerName, $phone, $idempotencyKey, $deviceId, &$waitingAfterJoin): Ticket {
                // Lock the business row: joins at this shop happen one at a
                // time, so numbers never collide and the queue limit holds
                // even when people join different services at once.
                $business = Business::query()->lockForUpdate()->findOrFail($business->id);
                $today = $business->today();

                // 3. One active ticket per device and per phone number.
                $active = Ticket::query()
                    ->where('business_id', $business->id)
                    ->where('queue_date', $today)
                    ->active()
                    ->where(fn ($query) => $query
                        ->where('device_id', $deviceId)
                        ->when($phone !== null, fn ($query) => $query->orWhere('phone', $phone)))
                    ->first();
                if ($active !== null) {
                    return $active;
                }

                // 4. Is the shop taking customers right now?
                $waitingCount = Ticket::query()
                    ->where('business_id', $business->id)
                    ->where('queue_date', $today)
                    ->where('status', TicketStatus::Waiting)
                    ->count();

                match ($business->joinClosedReason($waitingCount)) {
                    'paused' => $this->reject('queue', 'The queue is paused right now. Please check again in a little while.'),
                    'after_cutoff' => $this->reject('queue', 'The queue is closed for today.'),
                    'full' => $this->reject('queue', 'The queue is full right now. Please try again in a little while.'),
                    null => null,
                };

                $service = $business->services()
                    ->whereKey($serviceId)
                    ->where('is_active', true)
                    ->first();
                if ($service === null) {
                    $this->reject('service_id', 'Please choose one of the services listed.');
                }

                // Exact under the lock, for the owner's "almost full" alert.
                $waitingAfterJoin = $waitingCount + 1;

                // 5. Next number for this service today, e.g. A-024.
                $number = (int) Ticket::query()
                    ->where('service_id', $service->id)
                    ->where('queue_date', $today)
                    ->max('number') + 1;

                return Ticket::create([
                    'business_id' => $business->id,
                    'service_id' => $service->id,
                    'queue_date' => $today,
                    'number' => $number,
                    'code' => sprintf('%s-%03d', $service->prefix, $number),
                    'customer_name' => $customerName,
                    'phone' => $phone,
                    'status' => TicketStatus::Waiting,
                    'joined_at' => now(),
                    'idempotency_key' => $idempotencyKey,
                    'device_id' => $deviceId,
                ]);
            });
        } catch (UniqueConstraintViolationException $exception) {
            // The same form was submitted twice at the same moment and the
            // other request created the ticket first.
            $ticket = $this->findByIdempotencyKey($business, $idempotencyKey) ?? throw $exception;
        }

        // After commit, and only for a new ticket (not a repeat or an existing one).
        if ($ticket->wasRecentlyCreated) {
            $this->events->ticketJoined($ticket);
            $this->alerts->customerJoined($ticket, $waitingAfterJoin);
        }

        return $ticket;
    }

    private function findByIdempotencyKey(Business $business, string $idempotencyKey): ?Ticket
    {
        $ticket = Ticket::query()->where('idempotency_key', $idempotencyKey)->first();

        // A key from another shop's form is never valid here.
        if ($ticket !== null && $ticket->business_id !== $business->id) {
            $this->reject('queue', 'Something went wrong. Please reload the page and try again.');
        }

        return $ticket;
    }

    private function reject(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
