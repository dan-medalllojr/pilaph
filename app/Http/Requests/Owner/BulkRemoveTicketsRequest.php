<?php

namespace App\Http\Requests\Owner;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class BulkRemoveTicketsRequest extends FormRequest
{
    /**
     * Removing tickets is left to the owner (staff can only run the queue).
     */
    public function authorize(): bool
    {
        $user = $this->user();

        return $user !== null && $user->isOwner() && $user->business_id !== null;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'ticket_ids' => ['required', 'array', 'min:1', 'max:200'],
            'ticket_ids.*' => ['required', 'uuid'],
        ];
    }
}
