<?php

namespace App\Models;

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
 * @property string $timezone
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
// The QR token gates joining; only the owner's QR screen should ever show it.
#[Hidden(['qr_token'])]
class Business extends Model
{
    /** @use HasFactory<BusinessFactory> */
    use HasFactory;

    protected static function booted(): void
    {
        static::creating(function (Business $business): void {
            $business->qr_token ??= self::generateQrToken();
            $business->qr_token_date ??= $business->localNow()->startOfDay();
        });
    }

    public static function generateQrToken(): string
    {
        return Str::random(32);
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
     * @return 'paused'|'after_cutoff'|'full'|null
     */
    public function joinClosedReason(int $waitingCount): ?string
    {
        return match (true) {
            ! $this->is_open => 'paused',
            $this->isPastJoinCutoff() => 'after_cutoff',
            $this->max_waiting !== null && $waitingCount >= $this->max_waiting => 'full',
            default => null,
        };
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
            'qr_token_date' => 'date',
        ];
    }
}
