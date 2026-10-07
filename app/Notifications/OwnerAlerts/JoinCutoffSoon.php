<?php

namespace App\Notifications\OwnerAlerts;

/**
 * "Join cutoff in 30 minutes: new customers can join until 19:00. 8 waiting now."
 */
class JoinCutoffSoon extends OwnerAlert
{
    public function __construct(
        public int $minutesLeft,
        public string $cutoff,
        public int $waitingCount,
    ) {
        parent::__construct();
    }

    protected function title(): string
    {
        return $this->minutesLeft === 1 ? 'Join cutoff in 1 minute' : "Join cutoff in {$this->minutesLeft} minutes";
    }

    protected function body(): string
    {
        return "New customers can join until {$this->cutoff}. ".self::waiting($this->waitingCount).' now.';
    }

    protected function tag(): string
    {
        return 'cutoff-soon';
    }
}
