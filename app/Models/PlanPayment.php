<?php

namespace App\Models;

use App\Enums\PaymentStatus;
use App\Enums\Plan;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * @property string $id
 * @property int $business_id
 * @property int|null $user_id
 * @property Plan $plan
 * @property int $months
 * @property string $amount
 * @property string $currency
 * @property PaymentStatus $status
 * @property string|null $hitpay_request_id
 * @property string|null $hitpay_payment_id
 * @property string|null $checkout_url
 * @property CarbonImmutable|null $plan_ends_at
 * @property CarbonImmutable|null $paid_at
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 */
#[Fillable([
    'business_id',
    'user_id',
    'plan',
    'months',
    'amount',
    'currency',
    'status',
    'hitpay_request_id',
    'hitpay_payment_id',
    'checkout_url',
    'plan_ends_at',
    'paid_at',
])]
#[Hidden(['checkout_url'])]
class PlanPayment extends Model
{
    use HasUuids;

    /**
     * The ID is in the return link HitPay sends the owner back to, so use a
     * fully random UUID (v4) rather than a time-ordered one.
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
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'plan' => Plan::class,
            'months' => 'integer',
            'amount' => 'decimal:2',
            'status' => PaymentStatus::class,
            'plan_ends_at' => 'datetime',
            'paid_at' => 'datetime',
        ];
    }
}
