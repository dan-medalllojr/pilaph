<?php

namespace App\Actions;

use App\Enums\Plan;
use App\Models\Business;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Switches a paid plan on for some months, after a payment (online or by
 * `php artisan plan:set`). Paying never loses days already paid for:
 *
 * - the same plan, still running: the months are added after it ends;
 * - the trial's plan, during the trial: they start when the trial ends;
 * - a dearer plan while a cheaper one runs: it starts now, and the cheaper
 *   plan's unused days become days of the new one, at the same value;
 * - otherwise: they start now.
 */
class ActivatePlan
{
    /**
     * When the plan would end if the shop paid for it now.
     */
    public function endsAt(Business $business, Plan $plan, int $months): CarbonImmutable
    {
        return $this->startsAt($business, $plan)->addMonths($months);
    }

    /**
     * Why the owner can't buy this plan online right now, or null if they can.
     */
    public function refusal(Business $business, Plan $plan): ?string
    {
        return match (true) {
            $business->is_demo => "The demo can't buy a plan. Sign up to set up your own shop.",
            ! $plan->isPaid() => 'Choose Basic or Pro.',
            $business->hasPaidPlan() && $business->plan_expires_at === null => "Your {$business->plan->label()} plan has no end date, so there's nothing to pay.",
            $business->hasPaidPlan() && $plan->price() < $business->plan->price() => "You're on {$business->plan->label()} until {$business->plan_expires_at?->setTimezone($business->timezone)->format('M j, Y')}. You can switch to {$plan->label()} after that.",
            default => null,
        };
    }

    /**
     * Switches the plan on and returns when it ends (null: no end date).
     *
     * @param  int|null  $months  null: no end date.
     */
    public function execute(Business $business, Plan $plan, ?int $months): ?CarbonImmutable
    {
        if (! $plan->isPaid()) {
            throw new InvalidArgumentException('Only a paid plan can be switched on for some months.');
        }

        return DB::transaction(function () use ($business, $plan, $months): ?CarbonImmutable {
            // One payment at a time per shop, so two arriving together both count.
            $locked = Business::query()->lockForUpdate()->findOrFail($business->id);
            $endsAt = $months !== null ? $this->endsAt($locked, $plan, $months) : null;

            $locked->forceFill(['plan' => $plan, 'plan_expires_at' => $endsAt])->save();
            $business->setRawAttributes($locked->getAttributes(), true);

            return $endsAt;
        });
    }

    private function startsAt(Business $business, Plan $plan): CarbonImmutable
    {
        $now = now();
        $current = $business->plan_expires_at;

        if ($business->hasPaidPlan() && $current !== null) {
            if ($business->plan === $plan) {
                return $current;
            }

            // Upgrading: the unused part of the cheaper plan, in days of the new one.
            if ($plan->price() > $business->plan->price()) {
                $credit = (int) floor($now->diffInSeconds($current) * $business->plan->price() / $plan->price());

                return $now->addSeconds($credit);
            }
        }

        if ($business->onTrial() && $plan === Business::trialPlan() && $business->trial_ends_at !== null) {
            return $business->trial_ends_at;
        }

        return $now;
    }
}
