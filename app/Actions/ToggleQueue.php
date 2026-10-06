<?php

namespace App\Actions;

use App\Models\Business;
use App\Services\PublicQueueState;

/**
 * Opens or pauses the queue. Takes the state the owner wants rather than
 * flipping it, so a double tap can't undo itself.
 */
class ToggleQueue
{
    public function __construct(private PublicQueueState $queueState) {}

    public function execute(Business $business, bool $open): void
    {
        $business->update(['is_open' => $open]);

        $this->queueState->forget($business);
    }
}
