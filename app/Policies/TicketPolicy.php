<?php

namespace App\Policies;

use App\Models\Ticket;
use App\Models\User;

class TicketPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->business_id !== null;
    }

    public function view(User $user, Ticket $ticket): bool
    {
        return $user->worksAt($ticket->business_id);
    }

    /**
     * Done, no-show and recall: queue work, open to anyone at the business.
     */
    public function update(User $user, Ticket $ticket): bool
    {
        return $user->worksAt($ticket->business_id);
    }

    /**
     * Removing fake or spam tickets is left to the owner.
     */
    public function delete(User $user, Ticket $ticket): bool
    {
        return $user->isOwner() && $user->worksAt($ticket->business_id);
    }
}
