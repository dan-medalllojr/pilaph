<?php

namespace App\Http\Requests\Customer;

use App\Support\PhilippinePhone;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class JoinQueueRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'service_id' => ['required', 'integer'],
            'customer_name' => ['required', 'string', 'min:2', 'max:60'],
            'phone' => [
                'nullable',
                'string',
                'max:20',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (PhilippinePhone::normalize(is_string($value) ? $value : null) === null) {
                        $fail('Enter a mobile number like 0917 123 4567.');
                    }
                },
            ],
            // Generated once by the join form; a resubmit returns the same ticket.
            'idempotency_key' => ['required', 'uuid'],
            // The QR token from the scanned link; checked by CreateTicket.
            'k' => ['nullable', 'string', 'max:64'],
            // Honeypot: hidden from people, so only bots fill it in.
            'website' => ['prohibited'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'service_id.required' => 'Choose a service.',
            'customer_name.required' => 'Enter your name so staff can call you.',
            'website.prohibited' => 'Something went wrong. Please try again.',
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'customer_name' => 'name',
        ];
    }
}
