<?php

namespace App\Models;

use App\Enums\Plan;
use App\Support\PlanLimits;
use Carbon\CarbonImmutable;
use Database\Factories\BusinessFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * @property int $id
 * @property string $name
 * @property string $slug
 * @property bool $is_open
 * @property int $near_threshold
 * @property int|null $max_waiting
 * @property string|null $join_cutoff_time
 * @property string $qr_token
 * @property bool $rotate_qr_daily
 * @property CarbonImmutable $qr_token_date
 * @property string $display_token
 * @property bool $is_demo
 * @property string|null $photo_path
 * @property string|null $photo_disk
 * @property string $timezone
 * @property Plan $plan The plan paid for; see currentPlan() for the one in effect.
 * @property CarbonImmutable|null $plan_expires_at
 * @property CarbonImmutable|null $trial_ends_at
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 */
#[Fillable([
    'name',
    'slug',
    'is_open',
    'near_threshold',
    'max_waiting',
    'join_cutoff_time',
    'rotate_qr_daily',
    'timezone',
])]
// The QR token gates joining; only the owner's QR screens and the TV display
// show it. The display token is the TV link's secret. The plan columns are
// set only by the trial and `php artisan plan:set`, never from a form.
#[Hidden(['qr_token', 'display_token'])]
class Business extends Model
{
    /** @use HasFactory<BusinessFactory> */
    use HasFactory;

    protected static function booted(): void
    {
        static::creating(function (Business $business): void {
            $business->qr_token ??= self::generateQrToken();
            $business->qr_token_date ??= $business->localNow()->startOfDay();
            $business->display_token ??= self::generateDisplayToken();
        });

        // Turning on the nightly QR change starts counting from today, so the
        // code on the TV doesn't change mid-day the next time the job runs.
        static::saving(function (Business $business): void {
            if ($business->exists && $business->isDirty('rotate_qr_daily') && $business->rotate_qr_daily) {
                $business->qr_token_date = $business->localNow()->startOfDay();
            }
        });
    }

    public static function generateQrToken(): string
    {
        return Str::random(32);
    }

    /**
     * Short enough to type on a TV remote; no look-alike characters (0/o, 1/l/i).
     */
    public static function generateDisplayToken(): string
    {
        $alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';

        return implode('', array_map(
            fn () => $alphabet[random_int(0, strlen($alphabet) - 1)],
            range(1, 12),
        ));
    }

    /**
     * The current time in the business timezone.
     */
    public function localNow(): CarbonImmutable
    {
        return now($this->timezone ?? config('app.timezone'));
    }

    /**
     * Today's date in the business timezone; queue numbering resets on it.
     */
    public function today(): string
    {
        return $this->localNow()->toDateString();
    }

    /**
     * Joins close at the cutoff time each day (business timezone).
     */
    public function isPastJoinCutoff(): bool
    {
        // Postgres returns time columns as "HH:MM:SS", so a string compare works.
        return $this->join_cutoff_time !== null
            && $this->localNow()->format('H:i:s') >= $this->join_cutoff_time;
    }

    /**
     * Why new customers can't join right now, or null if they can.
     *
     * @param  bool  $monthlyLimitReached  From PlanUsage::joinsClosedForMonth().
     * @return 'paused'|'after_cutoff'|'monthly_limit'|'full'|null
     */
    public function joinClosedReason(int $waitingCount, bool $monthlyLimitReached = false): ?string
    {
        return match (true) {
            ! $this->is_open => 'paused',
            $this->isPastJoinCutoff() => 'after_cutoff',
            $monthlyLimitReached => 'monthly_limit',
            $this->max_waiting !== null && $waitingCount >= $this->max_waiting => 'full',
            default => null,
        };
    }

    /**
     * The plan in effect now: a paid plan until it ends, else the trial while
     * it lasts, else Free. The public demo shows everything.
     */
    public function currentPlan(): Plan
    {
        return match (true) {
            $this->is_demo => Plan::Pro,
            $this->hasPaidPlan() => $this->plan,
            $this->onTrial() => self::trialPlan(),
            default => Plan::Free,
        };
    }

    /**
     * What the shop can do now. A trial sends fewer texts than the plan it
     * tries, since every text costs.
     */
    public function limits(): PlanLimits
    {
        $limits = $this->currentPlan()->limits();

        return $this->onTrial()
            ? $limits->withMonthlySms(min($limits->monthlySms, (int) config('plans.trial.monthly_sms')))
            : $limits;
    }

    /**
     * A paid plan that hasn't ended (no end date: it doesn't end).
     */
    public function hasPaidPlan(): bool
    {
        return $this->plan->isPaid()
            && ($this->plan_expires_at === null || $this->plan_expires_at->isFuture());
    }

    public function onTrial(): bool
    {
        return ! $this->is_demo
            && ! $this->hasPaidPlan()
            && $this->trial_ends_at?->isFuture() === true;
    }

    /**
     * A paid plan that ended; the shop is on Free until it's renewed.
     */
    public function planLapsed(): bool
    {
        return $this->plan->isPaid() && $this->plan_expires_at?->isPast() === true;
    }

    /**
     * Days of ticket history to keep. After a paid plan ends, its longer
     * history stays for the grace period, so renewing late loses nothing.
     */
    public function historyDaysKept(): int
    {
        $days = $this->limits()->historyDays;
        $graceEnds = $this->plan_expires_at?->addDays((int) config('plans.grace_days'));

        if ($this->planLapsed() && $graceEnds?->isFuture() === true) {
            $days = max($days, $this->plan->limits()->historyDays);
        }

        return $days;
    }

    public static function trialPlan(): Plan
    {
        return Plan::from((string) config('plans.trial.plan'));
    }

    /**
     * The trial as the pricing pages describe it: its plan, its length, and
     * its texts (fewer than the plan's own).
     *
     * @return array{plan: string, days: int, texts: int}
     */
    public static function trialOffer(): array
    {
        $plan = self::trialPlan();

        return [
            'plan' => $plan->label(),
            'days' => (int) config('plans.trial.days'),
            'texts' => min($plan->limits()->monthlySms, (int) config('plans.trial.monthly_sms')),
        ];
    }

    /**
     * @return HasMany<User, $this>
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /**
     * @return HasMany<Service, $this>
     */
    public function services(): HasMany
    {
        return $this->hasMany(Service::class);
    }

    /**
     * @return HasMany<Counter, $this>
     */
    public function counters(): HasMany
    {
        return $this->hasMany(Counter::class);
    }

    /**
     * @return HasMany<Ticket, $this>
     */
    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_open' => 'boolean',
            'near_threshold' => 'integer',
            'max_waiting' => 'integer',
            'rotate_qr_daily' => 'boolean',
            'is_demo' => 'boolean',
            'qr_token_date' => 'date',
            'plan' => Plan::class,
            'plan_expires_at' => 'datetime',
            'trial_ends_at' => 'datetime',
        ];
    }
}
