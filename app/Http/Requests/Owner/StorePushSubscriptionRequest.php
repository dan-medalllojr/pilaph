<?php

namespace App\Http\Requests\Owner;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use NotificationChannels\WebPush\PushSubscription;

class StorePushSubscriptionRequest extends FormRequest
{
    /**
     * Browsers' push services. The server sends requests to the endpoint,
     * so only these are accepted: never an address someone made up.
     */
    private const PUSH_SERVICE_HOSTS = [
        'fcm.googleapis.com',            // Chrome, Edge on Android, Samsung Internet
        'push.services.mozilla.com',     // Firefox
        'push.apple.com',                // Safari (web.push.apple.com)
        'notify.windows.com',            // Edge on Windows
    ];

    public function authorize(): bool
    {
        return $this->user()?->business !== null;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'endpoint' => ['required', 'string', 'max:'.PushSubscription::ENDPOINT_MAX_LENGTH, 'url:https', $this->knownPushService(...)],
            'keys.p256dh' => ['required', 'string', 'max:255'],
            'keys.auth' => ['required', 'string', 'max:255'],
            'content_encoding' => ['nullable', 'in:aesgcm,aes128gcm'],
        ];
    }

    private function knownPushService(string $attribute, mixed $value, Closure $fail): void
    {
        $host = strtolower((string) parse_url((string) $value, PHP_URL_HOST));

        foreach (self::PUSH_SERVICE_HOSTS as $allowed) {
            if ($host === $allowed || str_ends_with($host, ".{$allowed}")) {
                return;
            }
        }

        $fail("This browser's alerts aren't supported.");
    }
}
