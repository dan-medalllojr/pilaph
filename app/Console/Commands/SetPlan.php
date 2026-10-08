<?php

namespace App\Console\Commands;

use App\Enums\Plan;
use App\Models\Business;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * For the admin, while payments are manual: after an owner pays by GCash or
 * Maya, switch their shop's plan on. Paying again for the same plan adds
 * the months after the current end date, so renewing early loses nothing.
 */
#[Signature('plan:set
    {shop : The shop\'s link name (as in /q/...) or its owner\'s email}
    {plan : free, basic or pro}
    {--months=1 : How many months were paid for}
    {--forever : No end date, e.g. for a shop you don\'t charge}')]
#[Description('Change a shop\'s plan (after a payment)')]
class SetPlan extends Command
{
    public function handle(): int
    {
        $business = $this->findBusiness((string) $this->argument('shop'));
        if ($business === null) {
            $this->components->error('No shop has that link name, and no shop owner uses that email.');

            return self::FAILURE;
        }

        if ($business->is_demo) {
            $this->components->error('The demo shop always shows every feature; it has no plan to change.');

            return self::FAILURE;
        }

        $plan = Plan::tryFrom(Str::lower((string) $this->argument('plan')));
        if ($plan === null) {
            $this->components->error('The plan must be free, basic or pro.');

            return self::FAILURE;
        }

        $months = filter_var($this->option('months'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 24]]);
        if ($plan->isPaid() && ! $this->option('forever') && $months === false) {
            $this->components->error('--months must be a whole number from 1 to 24.');

            return self::FAILURE;
        }

        if (! $plan->isPaid()) {
            $business->forceFill([
                'plan' => Plan::Free,
                'plan_expires_at' => null,
                // Free means free: a trial still running ends now.
                'trial_ends_at' => $business->onTrial() ? now() : $business->trial_ends_at,
            ])->save();

            $this->components->info("{$business->name} is now on the Free plan.");

            return self::SUCCESS;
        }

        if ($this->option('forever')) {
            $business->forceFill(['plan' => $plan, 'plan_expires_at' => null])->save();
            $this->components->info("{$business->name} is now on {$plan->label()}, with no end date.");

            return self::SUCCESS;
        }

        // Renewing the same plan early: the new months start when the current ones end.
        $renewing = $business->plan === $plan && $business->hasPaidPlan() && $business->plan_expires_at !== null;
        $start = $renewing ? $business->plan_expires_at : now();
        $endsAt = $start->addMonths((int) $months);

        if ($business->hasPaidPlan() && $business->plan !== $plan) {
            $this->components->warn("Switching from {$business->plan->label()}: its remaining days don't carry over. Add them with --months if you want.");
        }

        $business->forceFill(['plan' => $plan, 'plan_expires_at' => $endsAt])->save();

        $paid = number_format($plan->price() * (int) $months);
        $this->components->info(sprintf(
            '%s is now on %s until %s (%s for %d %s, ₱%s).',
            $business->name,
            $plan->label(),
            $endsAt->setTimezone($business->timezone)->format('M j, Y g:i A'),
            $renewing ? 'renewed' : 'paid',
            $months,
            Str::plural('month', (int) $months),
            $paid,
        ));

        return self::SUCCESS;
    }

    private function findBusiness(string $shop): ?Business
    {
        $shop = Str::lower(trim($shop));

        if (str_contains($shop, '@')) {
            return User::query()->whereRaw('lower(email) = ?', [$shop])->first()?->business;
        }

        return Business::query()->where('slug', $shop)->first();
    }
}
