<?php

namespace App\Services;

use App\Enums\Plan;
use App\Models\Business;
use App\Models\Counter;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * How much of its plan a shop has used this calendar month (business
 * timezone), and what that means for joining, texts and counters.
 *
 * @phpstan-type Notice array{tone: 'info'|'warning', message: string}
 */
class PlanUsage
{
    /**
     * Customers who joined this month.
     */
    public function customersThisMonth(Business $business): int
    {
        return $business->tickets()
            ->where('queue_date', '>=', $this->monthStart($business)->toDateString())
            ->count();
    }

    /**
     * True once the monthly customer limit was reached on an earlier day.
     * Reaching it never closes joining in the middle of a day, only from
     * the next one.
     */
    public function joinsClosedForMonth(Business $business): bool
    {
        $limit = $business->limits()->monthlyCustomers;

        return $limit !== null && $business->tickets()
            ->where('queue_date', '>=', $this->monthStart($business)->toDateString())
            ->where('queue_date', '<', $business->today())
            ->count() >= $limit;
    }

    /**
     * Texts sent (or being sent) this month: each one is claimed on its
     * ticket, on the ticket's own queue day, before it's queued.
     */
    public function textsThisMonth(Business $business): int
    {
        return (int) DB::table('tickets')
            ->where('business_id', $business->id)
            ->where('queue_date', '>=', $this->monthStart($business)->toDateString())
            ->selectRaw('count(near_sms_sent_at) + count(called_sms_sent_at) as sent')
            ->value('sent');
    }

    public function textsLeft(Business $business): int
    {
        $limit = $business->limits()->monthlySms;

        return $limit > 0 ? max(0, $limit - $this->textsThisMonth($business)) : 0;
    }

    /**
     * Active counters past the plan's limit can't call customers. The
     * oldest ones keep working, so a downgrade never stops the main chair.
     *
     * @return list<int>
     */
    public function lockedCounterIds(Business $business): array
    {
        $limit = $business->limits()->counters;
        if ($limit === null) {
            return [];
        }

        return array_values($business->counters()
            ->where('is_active', true)
            ->orderBy('id')
            ->offset($limit)
            ->pluck('id')
            ->all());
    }

    public function isCounterLocked(Counter $counter): bool
    {
        return in_array($counter->id, $this->lockedCounterIds($counter->business), true);
    }

    /**
     * Whether the shop may switch on (or add) one more counter.
     */
    public function canActivateCounter(Business $business): bool
    {
        $limit = $business->limits()->counters;

        return $limit === null || $business->counters()->where('is_active', true)->count() < $limit;
    }

    public function counterLimitMessage(Business $business): string
    {
        $limit = (int) $business->limits()->counters;
        $included = $limit === 1 ? '1 counter' : "{$limit} counters";

        return "The {$business->currentPlan()->label()} plan includes {$included} at a time. Switch one off, or upgrade under Plan & billing.";
    }

    /**
     * The Plan & billing page: the plan, its dates and this month's usage.
     *
     * @return array{
     *     plan: array{key: string, name: string, price: int},
     *     status: 'demo'|'trial'|'paid'|'lapsed'|'free',
     *     ends_at: string|null,
     *     lapsed_plan: string|null,
     *     limits: array{counters: int|null, monthly_customers: int|null, monthly_sms: int, history_days: int, photo: bool, branding: bool},
     *     usage: array{customers: int, texts: int, active_counters: int},
     *     resets_on: string,
     *     notice: Notice|null
     * }
     */
    public function summary(Business $business): array
    {
        $plan = $business->currentPlan();

        [$status, $endsAt] = match (true) {
            $business->is_demo => ['demo', null],
            $business->onTrial() => ['trial', $business->trial_ends_at],
            $business->hasPaidPlan() => ['paid', $business->plan_expires_at],
            $business->planLapsed() => ['lapsed', $business->plan_expires_at],
            default => ['free', null],
        };

        return [
            'plan' => ['key' => $plan->value, 'name' => $plan->label(), 'price' => $plan->price()],
            'status' => $status,
            'ends_at' => $endsAt?->toIso8601String(),
            'lapsed_plan' => $business->planLapsed() ? $business->plan->label() : null,
            'limits' => $business->limits()->toArray(),
            'usage' => [
                'customers' => $this->customersThisMonth($business),
                'texts' => $this->textsThisMonth($business),
                'active_counters' => $business->counters()->where('is_active', true)->count(),
            ],
            'resets_on' => $this->monthStart($business)->addMonth()->toDateString(),
            'notice' => $this->notice($business),
        ];
    }

    /**
     * The one thing the owner most needs to know about their plan, shown as
     * a banner on owner pages, or null when all is well.
     *
     * @return Notice|null
     */
    public function notice(Business $business): ?array
    {
        if ($business->is_demo) {
            return null;
        }

        $limits = $business->limits();
        $plan = $business->currentPlan();
        $now = $business->localNow();
        $nextMonth = $this->monthStart($business)->addMonth()->format('M j');

        // 1. Customers can't join (or won't be able to from tomorrow).
        if ($limits->monthlyCustomers !== null) {
            $customers = $this->customersThisMonth($business);
            $limit = $limits->monthlyCustomers;

            if ($this->joinsClosedForMonth($business)) {
                return $this->warning("Your queue reached the {$plan->label()} plan's {$limit} customers this month, so new customers can't join until {$nextMonth}. Upgrade to open it again.");
            }
            if ($customers >= $limit) {
                return $this->warning("Your queue reached the {$plan->label()} plan's {$limit} customers this month. Today's queue keeps going, but from tomorrow new customers can't join until {$nextMonth}. Upgrade to keep it open.");
            }
        }

        // 2. Counters that can't call anyone.
        $locked = $this->lockedCounterIds($business);
        if ($locked !== []) {
            $names = $business->counters()->whereIn('id', $locked)->orderBy('name')->pluck('name')->join(', ', ' and ');
            $included = $limits->counters === 1 ? '1 counter' : "{$limits->counters} counters";

            return $this->warning("The {$plan->label()} plan includes {$included}, so {$names} can't call customers. Upgrade, or switch counters off under Counters.");
        }

        // 3. A paid plan ended.
        if ($business->planLapsed() && $business->plan_expires_at !== null) {
            $ended = $business->plan_expires_at->setTimezone($business->timezone);
            $keptUntil = $ended->addDays((int) config('plans.grace_days'));
            if ($keptUntil->isFuture()) {
                return $this->warning("Your {$business->plan->label()} plan ended on {$ended->format('M j')}, so your shop is on the Free plan. Renew by {$keptUntil->format('M j')} to keep your older stats.");
            }
        }

        // 4. The trial or a paid plan ends soon.
        $endsAt = $business->onTrial() ? $business->trial_ends_at : ($business->hasPaidPlan() ? $business->plan_expires_at : null);
        if ($endsAt !== null) {
            $days = (int) $now->startOfDay()->diffInDays($endsAt->setTimezone($business->timezone)->startOfDay());
            $when = match (true) {
                $days <= 0 => 'today',
                $days === 1 => 'tomorrow',
                default => "in {$days} days ({$endsAt->setTimezone($business->timezone)->format('M j')})",
            };

            if ($business->onTrial() && $days <= 5) {
                return $this->info("Your {$plan->label()} trial ends {$when}. After that your shop moves to the Free plan: {$this->freePlanInBrief()}. Choose a plan to keep everything.");
            }
            if ($business->hasPaidPlan() && $days <= 5) {
                return $this->info("Your {$plan->label()} plan ends {$when}. Pay for the next month so nothing changes.");
            }
        }

        // 5. Texts running out.
        if ($limits->monthlySms > 0) {
            $texts = $this->textsThisMonth($business);
            if ($texts >= $limits->monthlySms) {
                return $this->warning("You've used all {$limits->monthlySms} texts for this month, so customers won't get texts until {$nextMonth}. Upgrade for more.");
            }
            if ($texts >= $limits->monthlySms * 0.8) {
                return $this->info("You've used {$texts} of this month's {$limits->monthlySms} texts.");
            }
        }

        // 6. Getting close to the monthly customer limit.
        if ($limits->monthlyCustomers !== null) {
            $customers = $this->customersThisMonth($business);
            if ($customers >= $limits->monthlyCustomers * 0.8) {
                return $this->info("{$customers} of the Free plan's {$limits->monthlyCustomers} customers this month. Upgrade for no limit.");
            }
        }

        // 7. The trial just ended.
        $trialEnded = $business->trial_ends_at?->setTimezone($business->timezone);
        if (! $business->hasPaidPlan() && $trialEnded !== null && $trialEnded->isPast() && $trialEnded->addDays(7)->isFuture()) {
            return $this->info("Your trial ended, so your shop is on the Free plan: {$this->freePlanInBrief()}. Choose a plan any time.");
        }

        return null;
    }

    /**
     * "1 counter, 300 customers a month and no texts".
     */
    private function freePlanInBrief(): string
    {
        $free = Plan::Free->limits();

        return collect([
            match ($free->counters) {
                null => 'any number of counters',
                1 => '1 counter',
                default => "{$free->counters} counters",
            },
            $free->monthlyCustomers !== null ? "{$free->monthlyCustomers} customers a month" : 'no customer limit',
            $free->monthlySms > 0 ? "{$free->monthlySms} texts a month" : 'no texts',
        ])->join(', ', ' and ');
    }

    /**
     * The first day of this month in the business timezone.
     */
    private function monthStart(Business $business): CarbonImmutable
    {
        return $business->localNow()->startOfMonth();
    }

    /**
     * @return Notice
     */
    private function info(string $message): array
    {
        return ['tone' => 'info', 'message' => $message];
    }

    /**
     * @return Notice
     */
    private function warning(string $message): array
    {
        return ['tone' => 'warning', 'message' => $message];
    }
}
