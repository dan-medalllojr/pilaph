<?php

namespace App\Notifications\OwnerAlerts;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;

/**
 * A push alert on the owner's phone or computer (public/sw.js shows it),
 * sent from the queue worker after the change commits.
 */
abstract class OwnerAlert extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct()
    {
        $this->afterCommit();
    }

    abstract protected function title(): string;

    abstract protected function body(): string;

    /**
     * Alerts with the same tag replace each other instead of piling up.
     */
    abstract protected function tag(): string;

    /**
     * @return list<class-string>
     */
    public function via(User $owner): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush(User $owner, Notification $notification): WebPushMessage
    {
        return (new WebPushMessage)
            ->title($this->title())
            ->body($this->body())
            ->icon('/pwa-192x192.png')
            ->badge('/badge-96x96.png')
            ->tag($this->tag())
            ->renotify()
            ->data(['url' => '/dashboard']);
    }

    protected static function waiting(int $count): string
    {
        return $count === 1 ? '1 waiting' : "{$count} waiting";
    }
}
