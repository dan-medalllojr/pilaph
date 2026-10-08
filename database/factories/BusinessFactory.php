<?php

namespace Database\Factories;

use App\Enums\Plan;
use App\Models\Business;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Business>
 */
class BusinessFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->randomElement(['Barbershop', 'Dental Clinic', 'Salon', 'Clinic', 'Office'])
            .' '.fake()->lastName();

        return [
            'name' => $name,
            'slug' => Str::slug($name).'-'.Str::lower(Str::random(5)),
            'is_open' => true,
            'near_threshold' => 3,
            'max_waiting' => null,
            'join_cutoff_time' => null,
            'rotate_qr_daily' => false,
            'timezone' => 'Asia/Manila',
            // Every feature, so tests about the queue aren't held back by a
            // plan limit; tests about plans use the states below.
            'plan' => Plan::Pro,
            'plan_expires_at' => null,
            'trial_ends_at' => null,
        ];
    }

    /**
     * On the Free plan, after the trial.
     */
    public function free(): static
    {
        return $this->state(fn (array $attributes) => [
            'plan' => Plan::Free,
            'plan_expires_at' => null,
            'trial_ends_at' => now()->subDays(20),
        ]);
    }

    /**
     * A new shop trying the trial plan.
     */
    public function onTrial(int $daysLeft = 10): static
    {
        return $this->state(fn (array $attributes) => [
            'plan' => Plan::Free,
            'plan_expires_at' => null,
            'trial_ends_at' => now()->addDays($daysLeft),
        ]);
    }

    /**
     * Paid for until the given time (null: no end date).
     */
    public function onPlan(Plan $plan, mixed $expiresAt = null): static
    {
        return $this->state(fn (array $attributes) => [
            'plan' => $plan,
            'plan_expires_at' => $expiresAt,
            'trial_ends_at' => now()->subMonth(),
        ]);
    }

    /**
     * The owner has paused the queue.
     */
    public function paused(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_open' => false,
        ]);
    }
}
