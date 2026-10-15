<?php

namespace App\Http\Requests\Owner;

use App\Models\Ticket;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class AddWalkInRequest extends FormRequest
{
    /**
     * Queue work: open to anyone at the business.
     */
    public function authorize(): bool
    {
        return $this->user()?->can('create', Ticket::class) === true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'service_id' => ['required', 'integer'],
            // Optional: staff in a hurry can leave it blank.
            'customer_name' => ['nullable', 'string', 'min:2', 'max:60'],
            // Generated once by the form; a resubmit returns the same ticket.
            'idempotency_key' => ['required', 'uuid'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'service_id.required' => 'Choose a service.',
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
