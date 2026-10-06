<?php

namespace App\Http\Controllers\Owner;

use App\Services\OwnerQueueState;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Today's queue: now serving per counter, the waiting list and quick stats.
 */
class DashboardController extends OwnerController
{
    public function __invoke(Request $request, OwnerQueueState $queueState): Response
    {
        return Inertia::render('dashboard', [
            'queue' => $queueState->forBusiness($this->business($request)),
        ]);
    }
}
