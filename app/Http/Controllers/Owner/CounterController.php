<?php

namespace App\Http\Controllers\Owner;

use App\Http\Requests\Owner\StoreCounterRequest;
use App\Http\Requests\Owner\UpdateCounterRequest;
use App\Models\Counter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class CounterController extends OwnerController
{
    public function index(Request $request): Response
    {
        Gate::authorize('viewAny', Counter::class);

        $counters = $this->business($request)->counters()
            ->withExists('tickets as has_tickets')
            ->orderBy('name')
            ->get()
            ->map(fn (Counter $counter) => [
                'id' => $counter->id,
                'name' => $counter->name,
                'is_active' => $counter->is_active,
                // Counters that served tickets can only be switched off.
                'has_tickets' => (bool) $counter->getAttribute('has_tickets'),
            ]);

        return Inertia::render('counters/index', [
            'counters' => $counters,
        ]);
    }

    public function store(StoreCounterRequest $request): RedirectResponse
    {
        $this->business($request)->counters()->create($request->validated());

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Counter added.')]);

        return to_route('counters.index');
    }

    public function update(UpdateCounterRequest $request, Counter $counter): RedirectResponse
    {
        $counter->update($request->validated());

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Counter updated.')]);

        return to_route('counters.index');
    }

    public function destroy(Counter $counter): RedirectResponse
    {
        Gate::authorize('delete', $counter);

        if ($counter->tickets()->exists()) {
            Inertia::flash('toast', [
                'type' => 'error',
                'message' => __('This counter has served tickets, so it can\'t be deleted. Switch it off instead.'),
            ]);

            return to_route('counters.index');
        }

        $counter->delete();

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Counter deleted.')]);

        return to_route('counters.index');
    }
}
