<?php

namespace App\Models;

use App\Enums\TicketStatus;
use Carbon\CarbonImmutable;
use Database\Factories\TicketFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;

/**
 * @property string $id
 * @property int $business_id
 * @property int $service_id
 * @property int|null $counter_id
 * @property CarbonImmutable $queue_date
 * @property int $number
 * @property string $code
 * @property string $customer_name
 * @property string|null $phone
 * @property bool $walk_in
 * @property TicketStatus $status
 * @property CarbonImmutable $joined_at
 * @property CarbonImmutable|null $called_at
 * @property CarbonImmutable|null $recalled_at
 * @property CarbonImmutable|null $completed_at
 * @property CarbonImmutable|null $near_sms_sent_at
 * @property CarbonImmutable|null $called_sms_sent_at
 * @property string $idempotency_key
 * @property string|null $device_id
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 */
#[Fillable([
    'business_id',
    'service_id',
    'counter_id',
    'queue_date',
    'number',
    'code',
    'customer_name',
    'phone',
    'walk_in',
    'status',
    'joined_at',
    'called_at',
    'completed_at',
    'near_sms_sent_at',
    'called_sms_sent_at',
    'idempotency_key',
    'device_id',
])]
#[Hidden(['idempotency_key', 'device_id'])]
class Ticket extends Model
{
    /** @use HasFactory<TicketFactory> */
    use HasFactory, HasUuids, Notifiable;

    /**
     * The ticket ID is the customer's link, so use a fully random UUID (v4)
     * rather than Laravel's default time-ordered v7, which reveals when it was
     * created and has fewer random bits.
     */
    public function newUniqueId(): string
    {
        return (string) Str::uuid();
    }

    /**
     * @return BelongsTo<Business, $this>
     */
    public function business(): BelongsTo
    {
        return $this->belongsTo(Business::class);
    }

    /**
     * @return BelongsTo<Service, $this>
     */
    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    /**
     * @return BelongsTo<Counter, $this>
     */
    public function counter(): BelongsTo
    {
        return $this->belongsTo(Counter::class);
    }

    /**
     * @return HasMany<SmsLog, $this>
     */
    public function smsLogs(): HasMany
    {
        return $this->hasMany(SmsLog::class);
    }

    /**
     * Texts go to the customer's phone, if they gave one.
     */
    public function routeNotificationForSemaphore(): ?string
    {
        return $this->phone;
    }

    /**
     * Waiting or called tickets: those still holding a place in the queue.
     *
     * @param  Builder<Ticket>  $query
     */
    public function scopeActive(Builder $query): void
    {
        $query->whereIn('status', TicketStatus::active());
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => TicketStatus::class,
            'queue_date' => 'date',
            'number' => 'integer',
            'walk_in' => 'boolean',
            'joined_at' => 'datetime',
            'called_at' => 'datetime',
            'recalled_at' => 'datetime',
            'completed_at' => 'datetime',
            'near_sms_sent_at' => 'datetime',
            'called_sms_sent_at' => 'datetime',
        ];
    }
}
