<?php

namespace App\Actions;

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Ticket;
use App\Services\QueueEvents;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Staff add a customer who has no phone or no internet. Numbered like
 * CreateTicket, but without the QR code, device or phone checks, and a
 * paused, closed or full queue doesn't stop it: staff decide in person.
 */
class AddWalkIn
{
    /** Stored when staff leave the name blank. */
    public const DEFAULT_NAME = 'Walk-in';

    public function __construct(private QueueEvents $events) {}

    /**
     * Returns the new ticket, or the first one when this is a repeated submit.
     *
     * @throws ValidationException when the service isn't one of the shop's active ones.
     */
    public function execute(Business $business, int $serviceId, ?string $customerName, string $idempotencyKey): Ticket
    {
        // A repeated submit (double tap, slow network) returns the first result.
        $previous = $this->findByIdempotencyKey($business, $idempotencyKey);
        if ($previous !== null) {
            return $previous;
        }

        try {
            $ticket = DB::transaction(function () use ($business, $serviceId, $customerName, $idempotencyKey): Ticket {
                // The same lock as CreateTicket, so walk-ins and QR joins
                // never get the same number.
                $business = Business::query()->lockForUpdate()->findOrFail($business->id);
                $today = $business->today();

                $service = $business->services()
                    ->whereKey($serviceId)
                    ->where('is_active', true)
                    ->first();
                if ($service === null) {
                    $this->reject('service_id', 'Choose one of the services listed.');
                }

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
                    'customer_name' => $customerName ?? self::DEFAULT_NAME,
                    'phone' => null,
                    'walk_in' => true,
                    'status' => TicketStatus::Waiting,
                    'joined_at' => now(),
                    'idempotency_key' => $idempotencyKey,
                    'device_id' => null,
                ]);
            });
        } catch (UniqueConstraintViolationException $exception) {
            // The same form was submitted twice at the same moment.
            $ticket = $this->findByIdempotencyKey($business, $idempotencyKey) ?? throw $exception;
        }

        // No push alert: someone at the shop just added them.
        if ($ticket->wasRecentlyCreated) {
            $this->events->ticketJoined($ticket);
        }

        return $ticket;
    }

    private function findByIdempotencyKey(Business $business, string $idempotencyKey): ?Ticket
    {
        $ticket = Ticket::query()->where('idempotency_key', $idempotencyKey)->first();

        if ($ticket !== null && $ticket->business_id !== $business->id) {
            $this->reject('service_id', 'Something went wrong. Please reload the page and try again.');
        }

        return $ticket;
    }

    private function reject(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
