<?php

namespace Database\Factories;

use App\Models\Business;
use App\Models\Service;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Service>
 */
class ServiceFactory extends Factory
{
    /**
     * Cycles A..Z so services created together get different prefixes.
     *
     * @var int<0, max>
     */
    private static int $prefixIndex = 0;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'business_id' => Business::factory(),
            'name' => fake()->randomElement(['Haircut', 'Consultation', 'Check-up', 'Cleaning', 'Payment']),
            'prefix' => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[self::$prefixIndex++ % 26],
            'default_minutes' => 15,
            'is_active' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_active' => false,
        ]);
    }
}
