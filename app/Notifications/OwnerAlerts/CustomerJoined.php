<?php

namespace App\Notifications\OwnerAlerts;

/**
 * "A-012 joined: Ana, Haircut. 5 waiting."
 */
class CustomerJoined extends OwnerAlert
{
    public function __construct(
        public string $code,
        public string $customerName,
        public string $service,
        public int $waitingCount,
    ) {
        parent::__construct();
    }

    protected function title(): string
    {
        return "{$this->code} joined";
    }

    protected function body(): string
    {
        return "{$this->customerName}, {$this->service}. ".self::waiting($this->waitingCount).'.';
    }

    protected function tag(): string
    {
        return 'customer-joined';
    }
}
