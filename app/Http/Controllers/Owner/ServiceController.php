<?php

namespace App\Http\Controllers\Owner;

use App\Http\Requests\Owner\StoreServiceRequest;
use App\Http\Requests\Owner\UpdateServiceRequest;
use App\Models\Service;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class ServiceController extends OwnerController
{
    public function index(Request $request): Response
    {
        Gate::authorize('viewAny', Service::class);

        $services = $this->business($request)->services()
            ->withExists('tickets as has_tickets')
            ->orderBy('prefix')
            ->get()
            ->map(fn (Service $service) => [
                'id' => $service->id,
                'name' => $service->name,
                'prefix' => $service->prefix,
                'default_minutes' => $service->default_minutes,
                'is_active' => $service->is_active,
                // Services with ticket history can only be switched off.
                'has_tickets' => (bool) $service->getAttribute('has_tickets'),
            ]);

        return Inertia::render('services/index', [
            'services' => $services,
        ]);
    }

    public function store(StoreServiceRequest $request): RedirectResponse
    {
        $this->business($request)->services()->create($request->validated());

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Service added.')]);

        return to_route('services.index');
    }

    public function update(UpdateServiceRequest $request, Service $service): RedirectResponse
    {
        $service->update($request->validated());

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Service updated.')]);

        return to_route('services.index');
    }

    public function destroy(Service $service): RedirectResponse
    {
        Gate::authorize('delete', $service);

        if ($service->tickets()->exists()) {
            Inertia::flash('toast', [
                'type' => 'error',
                'message' => __('This service has ticket history, so it can\'t be deleted. Switch it off instead.'),
            ]);

            return to_route('services.index');
        }

        $service->delete();

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Service deleted.')]);

        return to_route('services.index');
    }
}
