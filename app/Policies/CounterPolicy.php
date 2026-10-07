<?php

namespace App\Policies;

use App\Models\Counter;
use App\Models\User;

class CounterPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->business_id !== null;
    }

    public function view(User $user, Counter $counter): bool
    {
        return $user->worksAt($counter->business_id);
    }

    public function create(User $user): bool
    {
        return $user->isOwner() && $user->business_id !== null;
    }

    public function update(User $user, Counter $counter): bool
    {
        return $user->isOwner() && $user->worksAt($counter->business_id);
    }

    public function delete(User $user, Counter $counter): bool
    {
        return $user->isOwner() && $user->worksAt($counter->business_id);
    }

    /**
     * Calling the next customer is queue work, open to anyone at the business.
     */
    public function callNext(User $user, Counter $counter): bool
    {
        return $user->worksAt($counter->business_id);
    }
}
