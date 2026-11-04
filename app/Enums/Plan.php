<?php

namespace App\Enums;

use App\Support\PlanLimits;

/**
 * A shop's plan. Prices and limits live in config/plans.php.
 */
enum Plan: string
{
    case Free = 'free';
    case Basic = 'basic';
    case Pro = 'pro';

    public function label(): string
    {
        return (string) config("plans.plans.{$this->value}.name");
    }

    /** Pesos a month. */
    public function price(): int
    {
        return (int) config("plans.plans.{$this->value}.price");
    }

    public function isPaid(): bool
    {
        return $this !== self::Free;
    }

    public function limits(): PlanLimits
    {
        return PlanLimits::fromConfig((array) config("plans.plans.{$this->value}"));
    }

    /**
     * Every plan with its price and limits, for the pricing pages.
     *
     * @return list<array{key: string, name: string, price: int, limits: array<string, int|bool|null>}>
     */
    public static function catalog(): array
    {
        return array_map(fn (self $plan) => [
            'key' => $plan->value,
            'name' => $plan->label(),
            'price' => $plan->price(),
            'limits' => $plan->limits()->toArray(),
        ], self::cases());
    }
}
