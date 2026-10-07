<?php

namespace App\Notifications;

use App\Enums\SmsType;
use App\Enums\TicketStatus;
use App\Models\Ticket;

/**
 * "A-024, please proceed to Chair 2 at Juan's Barbershop."
 * Short, without a link, so it fits one SMS and goes out fast.
 */
class TicketCalled extends TicketText
{
    public function type(): SmsType
    {
        return SmsType::Called;
    }

    public function toSms(Ticket $ticket): string
    {
        $counter = $ticket->counter !== null ? self::plain($ticket->counter->name) : 'the counter';

        return self::fit(
            self::plain($ticket->business->name),
            fn (string $shop) => "{$ticket->code}, please proceed to {$counter} at {$shop}.",
        );
    }

    protected function stillRelevant(Ticket $ticket): bool
    {
        return $ticket->status === TicketStatus::Called;
    }
}
