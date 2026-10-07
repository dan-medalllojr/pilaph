<?php

namespace App\Enums;

enum TicketStatus: string
{
    case Waiting = 'waiting';
    case Called = 'called';
    case Done = 'done';
    case NoShow = 'no_show';
    case Cancelled = 'cancelled';

    /**
     * Waiting or called: the ticket still holds a place in today's queue.
     */
    public function isActive(): bool
    {
        return in_array($this, self::active(), true);
    }

    /**
     * @return list<self>
     */
    public static function active(): array
    {
        return [self::Waiting, self::Called];
    }
}
