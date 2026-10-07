<?php

namespace App\Models;

use App\Enums\SmsStatus;
use App\Enums\SmsType;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property string $ticket_id
 * @property string $phone
 * @property SmsType $type
 * @property string $message
 * @property SmsStatus $status
 * @property string|null $provider_message_id
 * @property string|null $provider_response
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 */
#[Fillable([
    'ticket_id',
    'phone',
    'type',
    'message',
    'status',
    'provider_message_id',
    'provider_response',
])]
class SmsLog extends Model
{
    /**
     * @return BelongsTo<Ticket, $this>
     */
    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => SmsType::class,
            'status' => SmsStatus::class,
        ];
    }
}
