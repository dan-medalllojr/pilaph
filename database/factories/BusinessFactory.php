<?php

namespace Database\Factories;

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
        ];
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
