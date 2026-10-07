<?php

namespace Database\Factories;

use App\Enums\TicketStatus;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Ticket>
 */
class TicketFactory extends Factory
{
    /**
     * Increments per created ticket so numbers never collide on
     * (service_id, queue_date, number).
     */
    private static int $number = 0;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $number = ++self::$number;

        return [
            'service_id' => Service::factory(),
            // Always the service's business, so a ticket can't straddle two businesses.
            'business_id' => fn (array $attributes) => Service::query()
                ->whereKey($attributes['service_id'])
                ->value('business_id'),
            'queue_date' => now('Asia/Manila')->toDateString(),
            'number' => $number,
            'code' => fn (array $attributes) => Service::query()->whereKey($attributes['service_id'])->value('prefix')
                .'-'.str_pad((string) $number, 3, '0', STR_PAD_LEFT),
            'customer_name' => fake()->firstName(),
            'phone' => null,
            'status' => TicketStatus::Waiting,
            'joined_at' => now(),
            'idempotency_key' => (string) Str::uuid(),
            'device_id' => 'dev-'.Str::random(16),
        ];
    }

    public function withPhone(): static
    {
        return $this->state(fn (array $attributes) => [
            'phone' => '639'.fake()->numerify('#########'),
        ]);
    }

    public function called(?Counter $counter = null): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => TicketStatus::Called,
            // Resolved after business_id, so the counter belongs to the same business.
            'counter_id' => $counter !== null
                ? $counter->id
                : fn (array $resolved) => Counter::factory()
                    ->create(['business_id' => $resolved['business_id']])
                    ->id,
            'called_at' => now(),
        ]);
    }

    public function done(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => TicketStatus::Done,
            'called_at' => now()->subMinutes(15),
            'completed_at' => now(),
        ]);
    }

    public function noShow(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => TicketStatus::NoShow,
            'completed_at' => now(),
        ]);
    }

    public function cancelled(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => TicketStatus::Cancelled,
            'completed_at' => now(),
        ]);
    }
}
