<?php

namespace App\Actions;

use App\Models\Business;

/**
 * Gives the TV display a new link, e.g. after the old one was shared by
 * mistake. Screens on the old link stop showing the queue.
 */
class ResetDisplayLink
{
    public function execute(Business $business): void
    {
        $business->forceFill(['display_token' => Business::generateDisplayToken()])->save();
    }
}
