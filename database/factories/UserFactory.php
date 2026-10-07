<?php

namespace Database\Factories;

use App\Enums\UserRole;
use App\Models\Business;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
        ];
    }

    /**
     * An owner with their own business (or the given one).
     */
    public function owner(?Business $business = null): static
    {
        return $this->state(fn (array $attributes) => [
            'business_id' => $business !== null ? $business->id : Business::factory(),
            'role' => UserRole::Owner,
        ]);
    }

    /**
     * Staff at the given business (role reserved for later versions).
     */
    public function staff(Business $business): static
    {
        return $this->state(fn (array $attributes) => [
            'business_id' => $business->id,
            'role' => UserRole::Staff,
        ]);
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    /**
     * Signed up with Google and never set a password.
     */
    public function withGoogle(): static
    {
        return $this->state(fn (array $attributes) => [
            'google_id' => (string) fake()->unique()->randomNumber(9, true),
            'password' => null,
        ]);
    }

    /**
     * Indicate that the model has two-factor authentication configured.
     */
    public function withTwoFactor(): static
    {
        return $this->state(fn (array $attributes) => [
            'two_factor_secret' => encrypt('secret'),
            'two_factor_recovery_codes' => encrypt(json_encode(['recovery-code-1'])),
            'two_factor_confirmed_at' => now(),
        ]);
    }
}
