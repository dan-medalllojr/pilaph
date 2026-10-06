<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Business;
use App\Services\PublicQueueState;
use Illuminate\Http\JsonResponse;

/**
 * Public JSON snapshot of a shop's queue (no personal data).
 */
class QueueStateController extends Controller
{
    public function __invoke(Business $business, PublicQueueState $queueState): JsonResponse
    {
        return response()
            ->json($queueState->forBusiness($business))
            ->header('Cache-Control', 'no-store');
    }
}
