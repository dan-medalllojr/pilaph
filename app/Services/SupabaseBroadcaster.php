<?php

namespace App\Services;

use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;

/**
 * Sends Supabase Realtime Broadcast messages from the server (REST API).
 * Browsers listen with @supabase/supabase-js using the publishable key only.
 */
class SupabaseBroadcaster
{
    public function enabled(): bool
    {
        return filled(config('services.supabase.url'))
            && filled(config('services.supabase.service_role_key'));
    }

    /**
     * @param  list<array{topic: string, event: string, payload: array<string, mixed>}>  $messages
     *
     * @throws RequestException when Supabase rejects the request (the job retries).
     */
    public function send(array $messages): void
    {
        if (! $this->enabled() || $messages === []) {
            return;
        }

        $url = rtrim((string) config('services.supabase.url'), '/');
        $key = (string) config('services.supabase.service_role_key');

        $request = Http::acceptJson()
            ->timeout(5)
            ->withHeaders(['apikey' => $key]);

        // The legacy service_role JWT also goes in the Authorization header;
        // new secret keys (sb_secret_...) must only be sent as apikey.
        if (str_starts_with($key, 'eyJ')) {
            $request = $request->withToken($key);
        }

        $request
            ->post("{$url}/realtime/v1/api/broadcast", ['messages' => $messages])
            ->throw();
    }
}
