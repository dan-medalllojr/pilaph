<?php

namespace App\Policies;

use App\Models\Business;
use App\Models\User;

class BusinessPolicy
{
    public function view(User $user, Business $business): bool
    {
        return $user->worksAt($business);
    }

    /**
     * Settings such as opening/pausing the queue, capacity, cutoff and QR token.
     */
    public function update(User $user, Business $business): bool
    {
        return $user->isOwner() && $user->worksAt($business);
    }
}
