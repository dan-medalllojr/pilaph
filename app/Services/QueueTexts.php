<?php

namespace App\Services;

use App\Enums\TicketStatus;
use App\Models\Ticket;
use App\Notifications\TicketCalled;
use App\Notifications\TicketNearTurn;

/**
 * Decides who gets a text when the queue moves (Plan.md, "Call next" step 6).
 * At most one "near" and one "called" text per ticket: each is claimed in
 * its *_sms_sent_at column before it's queued, so repeats send nothing.
 */
class QueueTexts
{
    /**
     * After a counter called someone: tell them, and give everyone now
     * within the shop's near-turn position a heads-up.
     */
    public function afterCall(Ticket $called): void
    {
        // Visitors type any number into the public demo: never text them.
        if ($called->business->is_demo) {
            return;
        }

        if ($this->claim($called, 'called_sms_sent_at')) {
            $called->notify(new TicketCalled);
        }

        $business = $called->business;

        // Everyone within the position, not just the one exactly at it:
        // two counters calling at once can move the queue past it.
        $nearFront = Ticket::query()
            ->where('business_id', $business->id)
            ->where('queue_date', $business->today())
            ->where('status', TicketStatus::Waiting)
            ->orderBy('joined_at')
            ->orderBy('number')
            ->limit($business->near_threshold)
            ->get();

        foreach ($nearFront->values() as $peopleAhead => $ticket) {
            if ($this->claim($ticket, 'near_sms_sent_at')) {
                $ticket->notify(new TicketNearTurn($peopleAhead));
            }
        }
    }

    /**
     * True once per ticket and text: marks it sent, if it has a phone and
     * wasn't already.
     */
    private function claim(Ticket $ticket, string $column): bool
    {
        return $ticket->phone !== null && Ticket::query()
            ->whereKey($ticket->id)
            ->whereNull($column)
            ->update([$column => now()]) === 1;
    }
}
