<?php

namespace App\Http\Controllers\Customer;

use App\Actions\CancelTicket;
use App\Enums\TicketStatus;
use App\Http\Controllers\Controller;
use App\Models\Ticket;
use App\Services\PublicQueueState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * A customer's ticket page. Its unguessable UUID link is their only identity.
 */
class TicketController extends Controller
{
    public function show(Ticket $ticket, PublicQueueState $queueState): Response
    {
        return Inertia::render('public/ticket', [
            'ticket' => $queueState->forTicket($ticket),
            'isDemo' => $ticket->business->is_demo,
        ]);
    }

    /**
     * JSON snapshot the ticket page polls for updates.
     */
    public function state(Ticket $ticket, PublicQueueState $queueState): JsonResponse
    {
        return response()
            ->json($queueState->forTicket($ticket))
            ->header('Cache-Control', 'no-store');
    }

    public function cancel(Ticket $ticket, CancelTicket $cancelTicket): RedirectResponse
    {
        $ticket = $cancelTicket->execute($ticket);

        Inertia::flash('toast', $ticket->status === TicketStatus::Cancelled
            ? ['type' => 'success', 'message' => __('You left the queue.')]
            : ['type' => 'info', 'message' => __('This ticket can no longer be cancelled.')]);

        return to_route('tickets.show', $ticket);
    }
}
