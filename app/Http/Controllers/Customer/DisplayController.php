<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Business;
use App\Services\DisplayState;
use Illuminate\Http\JsonResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The TV display at the shop. The link's token is its only key: it shows
 * the current QR code, so anyone with it could join without being there.
 */
class DisplayController extends Controller
{
    public function show(string $token, DisplayState $display): Response
    {
        return Inertia::render('public/display', [
            'display' => $display->forBusiness($this->business($token)),
            'stateUrl' => route('display.state', $token),
        ]);
    }

    public function state(string $token, DisplayState $display): JsonResponse
    {
        return response()->json($display->forBusiness($this->business($token)));
    }

    private function business(string $token): Business
    {
        return Business::query()->where('display_token', $token)->firstOrFail();
    }
}
