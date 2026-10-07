<?php

namespace App\Services;

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Ticket;
use App\Models\User;
use App\Notifications\OwnerAlerts\CustomerJoined;
use App\Notifications\OwnerAlerts\JoinCutoffSoon;
use App\Notifications\OwnerAlerts\OwnerAlert;
use App\Notifications\OwnerAlerts\QueueAlmostFull;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Notification;

/**
 * Push alerts to a shop's owners on the devices where they turned alerts on.
 */
class OwnerAlerts
{
    /** The cutoff reminder goes out this long before joins close. */
    public const CUTOFF_REMINDER_MINUTES = 30;

    /**
     * The waiting line size that triggers "almost full": max 30 -> 27
     * (3 spots left), max 10 -> 9 (1 spot left).
     */
    public static function almostFullAt(int $maxWaiting): int
    {
        return $maxWaiting - max(1, (int) ceil($maxWaiting * 0.1));
    }

    /**
     * After a customer joins. Always a "joined" alert; "almost full" when
     * this join is the one that reached the threshold.
     *
     * @param  int  $waitingCount  Including this ticket, counted under the join lock.
     */
    public function customerJoined(Ticket $ticket, int $waitingCount): void
    {
        $business = $ticket->business;

        $this->send($business, new CustomerJoined(
            $ticket->code,
            $ticket->customer_name,
            $ticket->service->name,
            $waitingCount,
        ));

        if ($business->max_waiting !== null && $waitingCount === self::almostFullAt($business->max_waiting)) {
            $this->send($business, new QueueAlmostFull($waitingCount, $business->max_waiting));
        }
    }

    /**
     * Once a day, in the half hour before the join cutoff (while the queue is open).
     */
    public function remindCutoff(Business $business): bool
    {
        if (! $business->is_open || $business->join_cutoff_time === null) {
            return false;
        }

        $now = $business->localNow();
        $cutoff = $now->setTimeFromTimeString($business->join_cutoff_time);
        $minutesLeft = (int) ceil($now->diffInSeconds($cutoff, false) / 60);

        if ($minutesLeft < 1 || $minutesLeft > self::CUTOFF_REMINDER_MINUTES || $this->recipients($business)->isEmpty()) {
            return false;
        }

        // Once per shop per day, even if the scheduler runs twice.
        if (! Cache::add("cutoff-reminder:{$business->id}:{$business->today()}", true, now()->addDay())) {
            return false;
        }

        $waiting = Ticket::query()
            ->where('business_id', $business->id)
            ->where('queue_date', $business->today())
            ->where('status', TicketStatus::Waiting)
            ->count();

        $this->send($business, new JoinCutoffSoon($minutesLeft, $cutoff->format('H:i'), $waiting));

        return true;
    }

    private function send(Business $business, OwnerAlert $alert): void
    {
        $recipients = $this->recipients($business);

        if ($recipients->isNotEmpty()) {
            Notification::send($recipients, $alert);
        }
    }

    /**
     * Owners with alerts turned on somewhere.
     *
     * @return Collection<int, User>
     */
    private function recipients(Business $business): Collection
    {
        return $business->users()->whereHas('pushSubscriptions')->get();
    }
}
