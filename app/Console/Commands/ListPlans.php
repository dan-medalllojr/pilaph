<?php

namespace App\Console\Commands;

use App\Models\Business;
use App\Models\User;
use App\Services\PlanUsage;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * For the admin: every shop's plan, when it ends and how busy it is, to see
 * who to remind about paying and who might want to upgrade.
 */
#[Signature('plan:list')]
#[Description('List every shop with its plan, end date and customers this month')]
class ListPlans extends Command
{
    public function handle(PlanUsage $usage): int
    {
        $rows = Business::query()
            ->where('is_demo', false)
            ->with(['users' => fn ($query) => $query->orderBy('id')])
            ->orderBy('name')
            ->get()
            ->map(function (Business $business) use ($usage) {
                $endsAt = $business->onTrial() ? $business->trial_ends_at : $business->plan_expires_at;
                $owner = $business->users->first();

                return [
                    'shop' => $business->name,
                    'link' => $business->slug,
                    'owner' => $owner instanceof User ? $owner->email : '',
                    'plan' => match (true) {
                        $business->onTrial() => "{$business->currentPlan()->label()} (trial)",
                        $business->planLapsed() => "Free ({$business->plan->label()} ended)",
                        default => $business->currentPlan()->label(),
                    },
                    'ends' => $endsAt?->setTimezone($business->timezone)->format('M j, Y') ?? '',
                    'customers' => $usage->customersThisMonth($business),
                    'texts' => $usage->textsThisMonth($business),
                ];
            });

        if ($rows->isEmpty()) {
            $this->components->info('No shops yet.');

            return self::SUCCESS;
        }

        $this->table(
            ['Shop', 'Link', 'Owner', 'Plan', 'Ends', 'Customers this month', 'Texts this month'],
            $rows->all(),
        );

        return self::SUCCESS;
    }
}
