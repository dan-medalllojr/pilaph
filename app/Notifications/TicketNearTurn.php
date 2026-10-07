<?php

namespace App\Notifications;

use App\Enums\SmsType;
use App\Enums\TicketStatus;
use App\Models\Ticket;
use Illuminate\Support\Str;

/**
 * "Hi Ana, 2 people ahead of you at Juan's Barbershop (A-024). ..."
 * With the ticket link, so they can reopen it from any phone.
 */
class TicketNearTurn extends TicketText
{
    /**
     * @param  int  $peopleAhead  When the queue moved; it may be fewer by the time it arrives.
     */
    public function __construct(public int $peopleAhead)
    {
        parent::__construct();
    }

    public function type(): SmsType
    {
        return SmsType::Near;
    }

    public function toSms(Ticket $ticket): string
    {
        $firstName = Str::limit(Str::before(self::plain($ticket->customer_name).' ', ' '), 15, '');
        $where = match ($this->peopleAhead) {
            0 => "you're next at",
            1 => '1 person ahead of you at',
            default => "{$this->peopleAhead} people ahead of you at",
        };
        $link = route('tickets.show', $ticket);

        return self::fit(
            self::plain($ticket->business->name),
            fn (string $shop) => "Hi {$firstName}, {$where} {$shop} ({$ticket->code}). Please head back now. {$link}",
        );
    }

    protected function stillRelevant(Ticket $ticket): bool
    {
        return $ticket->status === TicketStatus::Waiting;
    }
}
