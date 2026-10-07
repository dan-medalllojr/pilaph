<?php

namespace App\Services;

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Counter;

/**
 * What the TV display shows: who each counter is serving, who's next, and
 * the QR code to join. Only for holders of the display link, since it
 * contains the shop's current QR token. No names or phone numbers.
 *
 * @phpstan-type Display array{
 *     business: array{id: int, name: string, closed_reason: 'paused'|'after_cutoff'|'full'|null},
 *     counters: list<array{name: string, code: string|null}>,
 *     next_codes: list<string>,
 *     waiting_count: int,
 *     join: array{url: string, image: string}|null
 * }
 */
class DisplayState
{
    /** How many upcoming numbers the TV lists. */
    private const NEXT_COUNT = 5;

    public function __construct(
        private PublicQueueState $queueState,
        private JoinQrCode $qrCode,
    ) {}

    /**
     * @return Display
     */
    public function forBusiness(Business $business): array
    {
        $queue = $this->queueState->forBusiness($business);
        $closedReason = $queue['business']['closed_reason'];

        $calledCodes = $business->tickets()
            ->where('queue_date', $business->today())
            ->where('status', TicketStatus::Called)
            ->whereNotNull('counter_id')
            ->pluck('code', 'counter_id');

        // Active counters, plus a switched-off one still serving someone.
        $counters = $business->counters()
            ->orderBy('name')
            ->get()
            ->filter(fn (Counter $counter) => $counter->is_active || $calledCodes->has($counter->id))
            ->map(fn (Counter $counter) => [
                'name' => $counter->name,
                'code' => $calledCodes->get($counter->id),
            ]);

        return [
            'business' => [
                'id' => $business->id,
                'name' => $business->name,
                'closed_reason' => $closedReason,
            ],
            'counters' => array_values($counters->all()),
            'next_codes' => array_slice($queue['waiting_codes'], 0, self::NEXT_COUNT),
            'waiting_count' => $queue['waiting_count'],
            // No QR while new customers can't join anyway.
            'join' => $closedReason === null ? $this->qrCode->forBusiness($business) : null,
        ];
    }
}
