<?php

namespace App\Services;

use Illuminate\Http\Client\RequestException;

/**
 * Sends Supabase Realtime Broadcast messages from the server (REST API).
 * Browsers listen with @supabase/supabase-js using the publishable key only.
 */
class SupabaseBroadcaster
{
    public function __construct(private SupabaseApi $supabase) {}

    public function enabled(): bool
    {
        return $this->supabase->configured();
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

        $this->supabase->request()
            ->timeout(5)
            ->post($this->supabase->url('realtime/v1/api/broadcast'), ['messages' => $messages])
            ->throw();
    }
}
