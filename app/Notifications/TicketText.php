<?php

namespace App\Notifications;

use App\Enums\SmsType;
use App\Models\Ticket;
use App\Notifications\Channels\SemaphoreChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Str;

/**
 * A text to a customer about their ticket, sent from the queue worker.
 *
 * Messages are plain ASCII and at most 160 characters: one SMS credit. A
 * single character outside the basic SMS alphabet (an emoji, or a letter
 * like "á") would switch the whole text to 70-character parts.
 */
abstract class TicketText extends Notification implements ShouldQueue
{
    use Queueable;

    /** Retries happen only when Semaphore said it failed (see SemaphoreChannel). */
    public int $tries = 3;

    /** @var list<int> */
    public array $backoff = [10, 60];

    public const MAX_LENGTH = 160;

    public function __construct()
    {
        $this->afterCommit();
    }

    abstract public function type(): SmsType;

    abstract public function toSms(Ticket $ticket): string;

    /**
     * Whether the text still makes sense when the worker gets to it.
     */
    abstract protected function stillRelevant(Ticket $ticket): bool;

    /**
     * @return list<class-string>
     */
    public function via(Ticket $ticket): array
    {
        return [SemaphoreChannel::class];
    }

    public function shouldSend(Ticket $ticket, string $channel): bool
    {
        $ticket->refresh();

        return $ticket->phone !== null && $this->stillRelevant($ticket);
    }

    /**
     * A name or place as plain ASCII: "Peña" becomes "Pena".
     */
    protected static function plain(string $text): string
    {
        return trim((string) preg_replace('/\s+/', ' ', Str::ascii($text)));
    }

    /**
     * Fills the template, shortening the shop name if needed to stay in one SMS.
     *
     * @param  callable(string): string  $template  Builds the message for a given shop name.
     */
    protected static function fit(string $shop, callable $template): string
    {
        $message = $template($shop);
        $overflow = strlen($message) - self::MAX_LENGTH;

        if ($overflow > 0) {
            $message = $template(rtrim(substr($shop, 0, max(8, strlen($shop) - $overflow))));
        }

        return substr($message, 0, self::MAX_LENGTH);
    }
}
