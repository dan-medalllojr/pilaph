<?php

namespace App\Notifications\OwnerAlerts;

/**
 * "Queue almost full: 27 of 30 spots taken."
 */
class QueueAlmostFull extends OwnerAlert
{
    public function __construct(
        public int $waitingCount,
        public int $maxWaiting,
    ) {
        parent::__construct();
    }

    protected function title(): string
    {
        return 'Queue almost full';
    }

    protected function body(): string
    {
        return "{$this->waitingCount} of {$this->maxWaiting} spots taken. New customers can't join once it's full.";
    }

    protected function tag(): string
    {
        return 'queue-almost-full';
    }
}
