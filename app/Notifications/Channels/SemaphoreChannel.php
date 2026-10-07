<?php

namespace App\Notifications\Channels;

use App\Enums\SmsStatus;
use App\Models\SmsLog;
use App\Models\Ticket;
use App\Notifications\TicketText;
use App\Services\SemaphoreClient;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Sends ticket texts with Semaphore, or writes them to the log when
 * SMS_DRIVER=log. Every attempt is recorded in sms_logs.
 *
 * A text is retried only when Semaphore answered that it failed on its side
 * (5xx or rate limited): then nothing went out. When there's no answer at
 * all, it may have gone out, so it isn't retried; customers never get the
 * same text twice.
 */
class SemaphoreChannel
{
    public function __construct(private SemaphoreClient $semaphore) {}

    public function send(Ticket $ticket, TicketText $text): void
    {
        $phone = $ticket->routeNotificationFor('semaphore', $text);
        if (! is_string($phone) || $phone === '') {
            return;
        }

        $message = $text->toSms($ticket);
        $log = fn (SmsStatus $status, ?string $response = null, ?string $messageId = null) => SmsLog::create([
            'ticket_id' => $ticket->id,
            'phone' => $phone,
            'type' => $text->type(),
            'message' => $message,
            'status' => $status,
            'provider_message_id' => $messageId,
            'provider_response' => $response !== null ? mb_substr($response, 0, 2000) : null,
        ]);

        if (config('services.sms.driver') !== 'semaphore') {
            Log::info('SMS to '.substr($phone, 0, 5).'*****'.substr($phone, -2).": {$message}");
            $log(SmsStatus::Logged);

            return;
        }

        if (! $this->semaphore->configured()) {
            $log(SmsStatus::Failed, 'SMS_DRIVER is semaphore but SEMAPHORE_API_KEY is empty.');

            return;
        }

        try {
            $record = $this->semaphore->send($phone, $message);
        } catch (RequestException $e) {
            $log(SmsStatus::Failed, "HTTP {$e->response->status()}: {$e->response->body()}");

            if ($e->response->serverError() || $e->response->status() === 429) {
                throw $e;
            }

            return;
        } catch (ConnectionException $e) {
            $log(SmsStatus::Failed, 'No answer from Semaphore: '.$e->getMessage());

            return;
        } catch (RuntimeException $e) {
            $log(SmsStatus::Failed, $e->getMessage());

            return;
        }

        $failed = strcasecmp((string) ($record['status'] ?? ''), 'Failed') === 0;
        $log(
            $failed ? SmsStatus::Failed : SmsStatus::Sent,
            (string) json_encode($record),
            isset($record['message_id']) ? (string) $record['message_id'] : null,
        );
    }
}
