<?php

namespace App\Jobs;

use App\Models\Business;
use App\Services\PublicQueueState;
use App\Services\SupabaseBroadcaster;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Sends one queue change to Supabase Realtime, off the request cycle so
 * "Call next" stays fast. Dispatched only after the database commits.
 *
 * Messages carry no personal data and no ticket IDs on the shared queue
 * channel (a ticket's ID is its owner's key to it).
 *
 * @phpstan-type PublicTicket array{code: string, counter: string|null, status: string, recalled?: true}
 * @phpstan-type TicketUpdate array{id: string, code: string, counter: string|null, status: string, recalled?: true}
 */
class BroadcastQueueUpdate implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** @var list<int> */
    public array $backoff = [1, 5];

    /**
     * @param  string  $event  ticket.joined | ticket.called | ticket.updated | queue.toggled | queue.reset
     * @param  PublicTicket|null  $subject  The ticket the event is about, as anyone may see it.
     * @param  list<TicketUpdate>  $ticketUpdates  Changed tickets, each also told on its own channel.
     */
    public function __construct(
        public int $businessId,
        public string $event,
        public ?array $subject = null,
        public array $ticketUpdates = [],
    ) {
        $this->afterCommit();
    }

    public function handle(SupabaseBroadcaster $broadcaster, PublicQueueState $queueState): void
    {
        $business = Business::query()->find($this->businessId);
        if ($business === null) {
            return;
        }

        // The whole public snapshot, so customer pages update without refetching.
        $messages = [[
            'topic' => "queue:{$business->id}",
            'event' => $this->event,
            'payload' => [
                'ticket' => $this->subject,
                'queue' => $queueState->forBusiness($business),
            ],
        ]];

        foreach ($this->ticketUpdates as $update) {
            ['id' => $id] = $update;
            unset($update['id']);

            $messages[] = [
                'topic' => "ticket:{$id}",
                'event' => $update['status'] === 'called' ? 'ticket.called' : 'ticket.updated',
                'payload' => $update,
            ];
        }

        $broadcaster->send($messages);
    }
}
