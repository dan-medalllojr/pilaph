<?php

namespace App\Support;

/**
 * What a plan allows (config/plans.php). `null` means no limit.
 */
final readonly class PlanLimits
{
    public function __construct(
        public ?int $counters,
        public ?int $monthlyCustomers,
        public int $monthlySms,
        public int $historyDays,
        public bool $photo,
        public bool $branding,
    ) {}

    /**
     * @param  array<mixed>  $config
     */
    public static function fromConfig(array $config): self
    {
        $limit = fn (string $key): ?int => isset($config[$key]) ? (int) $config[$key] : null;

        return new self(
            counters: $limit('counters'),
            monthlyCustomers: $limit('monthly_customers'),
            monthlySms: $limit('monthly_sms') ?? 0,
            historyDays: $limit('history_days') ?? 30,
            photo: (bool) ($config['photo'] ?? false),
            branding: (bool) ($config['branding'] ?? true),
        );
    }

    public function withMonthlySms(int $monthlySms): self
    {
        return new self(
            $this->counters,
            $this->monthlyCustomers,
            $monthlySms,
            $this->historyDays,
            $this->photo,
            $this->branding,
        );
    }

    /**
     * @return array{counters: int|null, monthly_customers: int|null, monthly_sms: int, history_days: int, photo: bool, branding: bool}
     */
    public function toArray(): array
    {
        return [
            'counters' => $this->counters,
            'monthly_customers' => $this->monthlyCustomers,
            'monthly_sms' => $this->monthlySms,
            'history_days' => $this->historyDays,
            'photo' => $this->photo,
            'branding' => $this->branding,
        ];
    }
}
