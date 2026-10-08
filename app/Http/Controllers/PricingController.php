<?php

namespace App\Http\Controllers;

use App\Enums\Plan;
use App\Models\Business;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The public pages that show prices: the landing page and /pricing.
 */
class PricingController extends Controller
{
    public function home(): Response
    {
        return Inertia::render('welcome', $this->pricing());
    }

    public function show(): Response
    {
        return Inertia::render('pricing', $this->pricing());
    }

    /**
     * @return array{plans: list<array{key: string, name: string, price: int, limits: array<string, int|bool|null>}>, trial: array{plan: string, days: int}}
     */
    private function pricing(): array
    {
        return [
            'plans' => Plan::catalog(),
            'trial' => [
                'plan' => Business::trialPlan()->label(),
                'days' => (int) config('plans.trial.days'),
            ],
        ];
    }
}
