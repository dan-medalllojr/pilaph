<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * Server-to-server requests to Supabase (Realtime broadcasts, Storage),
 * signed with the secret key. Never used from the browser.
 */
class SupabaseApi
{
    public function configured(): bool
    {
        return filled(config('services.supabase.url'))
            && filled(config('services.supabase.service_role_key'));
    }

    public function url(string $path): string
    {
        return rtrim((string) config('services.supabase.url'), '/').'/'.ltrim($path, '/');
    }

    public function request(): PendingRequest
    {
        $key = (string) config('services.supabase.service_role_key');

        $request = Http::acceptJson()->withHeaders(['apikey' => $key]);

        // The legacy service_role JWT also goes in the Authorization header;
        // new secret keys (sb_secret_...) must only be sent as apikey.
        return str_starts_with($key, 'eyJ') ? $request->withToken($key) : $request;
    }
}
