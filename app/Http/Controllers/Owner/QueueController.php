<?php

namespace App\Http\Controllers\Owner;

use App\Actions\BulkRemoveTickets;
use App\Actions\CallNextTicket;
use App\Actions\FinishTicket;
use App\Actions\RecallTicket;
use App\Actions\ToggleQueue;
use App\Enums\TicketStatus;
use App\Http\Requests\Owner\BulkRemoveTicketsRequest;
use App\Http\Requests\Owner\CallNextRequest;
use App\Http\Requests\Owner\ToggleQueueRequest;
use App\Models\Counter;
use App\Models\Ticket;
use App\Services\OwnerQueueState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

/**
 * Running today's queue from the dashboard.
 */
class QueueController extends OwnerController
{
    /**
     * JSON snapshot the dashboard refetches (with names, owner only).
     */
    public function state(Request $request, OwnerQueueState $queueState): JsonResponse
    {
        Gate::authorize('viewAny', Ticket::class);

        return response()
            ->json($queueState->forBusiness($this->business($request)))
            ->header('Cache-Control', 'no-store');
    }

    public function callNext(CallNextRequest $request, Counter $counter, CallNextTicket $callNext): RedirectResponse
    {
        $expected = $request->filled('expected_current_ticket_id')
            ? $request->string('expected_current_ticket_id')->value()
            : null;

        ['finished' => $finished, 'called' => $called] = $callNext->execute($counter, $expected);

        $this->toast(match (true) {
            $called !== null => ['success', __('Calling :code to :counter.', ['code' => $called->code, 'counter' => $counter->name])],
            $finished !== null => ['info', __(':code is done. Nobody else is waiting.', ['code' => $finished->code])],
            default => ['info', __('Nobody is waiting.')],
        });

        return to_route('dashboard');
    }

    public function done(Ticket $ticket, FinishTicket $finish): RedirectResponse
    {
        Gate::authorize('update', $ticket);

        $this->toast($finish->execute($ticket, TicketStatus::Done)
            ? ['success', __(':code is done.', ['code' => $ticket->code])]
            : ['info', __(':code was already finished.', ['code' => $ticket->code])]);

        return to_route('dashboard');
    }

    public function noShow(Ticket $ticket, FinishTicket $finish): RedirectResponse
    {
        Gate::authorize('update', $ticket);

        $this->toast($finish->execute($ticket, TicketStatus::NoShow)
            ? ['success', __(':code marked as no-show.', ['code' => $ticket->code])]
            : ['info', __(':code was already finished.', ['code' => $ticket->code])]);

        return to_route('dashboard');
    }

    public function recall(Ticket $ticket, RecallTicket $recall): RedirectResponse
    {
        Gate::authorize('update', $ticket);

        $this->toast($recall->execute($ticket)
            ? ['success', __('Calling :code again.', ['code' => $ticket->code])]
            : ['info', __(':code is no longer being called.', ['code' => $ticket->code])]);

        return to_route('dashboard');
    }

    public function bulkRemove(BulkRemoveTicketsRequest $request, BulkRemoveTickets $bulkRemove): RedirectResponse
    {
        // Validated as UUIDs; the filter just tells PHP they are strings.
        $ids = array_values(array_filter($request->array('ticket_ids'), 'is_string'));
        $removed = $bulkRemove->execute($this->business($request), $ids);

        $this->toast(['success', trans_choice('{0} No tickets removed.|{1} Removed 1 ticket.|[2,*] Removed :count tickets.', $removed)]);

        return to_route('dashboard');
    }

    public function toggle(ToggleQueueRequest $request, ToggleQueue $toggle): RedirectResponse
    {
        $open = $request->boolean('is_open');
        $toggle->execute($this->business($request), $open);

        $this->toast(['success', $open ? __('Queue open. Customers can join.') : __('Queue paused. New customers can\'t join.')]);

        return to_route('dashboard');
    }

    /**
     * @param  array{0: 'success'|'info'|'error', 1: string}  $toast
     */
    private function toast(array $toast): void
    {
        Inertia::flash('toast', ['type' => $toast[0], 'message' => $toast[1]]);
    }
}
