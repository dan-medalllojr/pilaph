<?php

namespace App\Policies;

use App\Models\Service;
use App\Models\User;

class ServicePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->business_id !== null;
    }

    public function view(User $user, Service $service): bool
    {
        return $user->worksAt($service->business_id);
    }

    public function create(User $user): bool
    {
        return $user->isOwner() && $user->business_id !== null;
    }

    public function update(User $user, Service $service): bool
    {
        return $user->isOwner() && $user->worksAt($service->business_id);
    }

    public function delete(User $user, Service $service): bool
    {
        return $user->isOwner() && $user->worksAt($service->business_id);
    }
}
