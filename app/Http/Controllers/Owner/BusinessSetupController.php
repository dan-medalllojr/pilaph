<?php

namespace App\Http\Controllers\Owner;

use App\Actions\CreateBusiness;
use App\Http\Requests\Owner\StoreBusinessRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * First run after sign-up: name the shop.
 */
class BusinessSetupController extends OwnerController
{
    public function create(Request $request): Response|RedirectResponse
    {
        if ($request->user()?->business_id !== null) {
            return to_route('dashboard');
        }

        return Inertia::render('business/setup');
    }

    public function store(StoreBusinessRequest $request, CreateBusiness $createBusiness): RedirectResponse
    {
        $createBusiness->execute($this->owner($request), $request->string('name')->value());

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Shop created. Next, add your services.')]);

        return to_route('services.index');
    }
}
