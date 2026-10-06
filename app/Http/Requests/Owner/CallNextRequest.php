<?php

namespace App\Http\Requests\Owner;

use App\Models\Counter;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class CallNextRequest extends FormRequest
{
    public function authorize(): bool
    {
        $counter = $this->route('counter');

        return $counter instanceof Counter && $this->user()?->can('callNext', $counter) === true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // The ticket the owner saw at this counter when tapping (empty if none).
            'expected_current_ticket_id' => ['nullable', 'uuid'],
        ];
    }
}
