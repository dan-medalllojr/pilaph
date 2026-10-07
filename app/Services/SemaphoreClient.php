<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Semaphore's SMS API (semaphore.co), the Philippine SMS provider.
 */
class SemaphoreClient
{
    public function configured(): bool
    {
        return filled(config('services.semaphore.api_key'));
    }

    /**
     * Sends one text to a 639XXXXXXXXX number.
     *
     * @return array<string, mixed> Semaphore's record of the message (message_id, status, ...).
     *
     * @throws RequestException when Semaphore answers with an error status.
     * @throws ConnectionException when Semaphore can't be reached or doesn't answer in time.
     * @throws RuntimeException when Semaphore answers but doesn't accept the message.
     */
    public function send(string $number, string $message): array
    {
        $response = Http::asForm()
            ->acceptJson()
            ->timeout(10)
            ->post(config('services.semaphore.url').'/messages', array_filter([
                'apikey' => config('services.semaphore.api_key'),
                'number' => $number,
                'message' => $message,
                'sendername' => config('services.semaphore.sender_name'),
            ], filled(...)))
            ->throw();

        // Success is a list with one record per number; anything else (e.g. a
        // validation error such as an unapproved sender name) is a refusal.
        $record = $response->json('0');
        if (! is_array($record) || ! isset($record['message_id'])) {
            throw new RuntimeException('Semaphore did not accept the message: '.$response->body());
        }

        return $record;
    }
}
