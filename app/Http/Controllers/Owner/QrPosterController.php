<?php

namespace App\Http\Controllers\Owner;

use App\Services\JoinQrCode;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class QrPosterController extends OwnerController
{
    public function show(Request $request, JoinQrCode $qrCode): Response
    {
        $business = $this->business($request);
        Gate::authorize('view', $business);

        return Inertia::render('qr/poster', [
            'business' => [
                'name' => $business->name,
                'rotate_qr_daily' => $business->rotate_qr_daily,
            ],
            'join' => $qrCode->forBusiness($business),
            'branding' => $business->limits()->branding,
        ]);
    }
}
