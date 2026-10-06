<?php

namespace App\Http\Requests\Owner;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ToggleQueueRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user?->business !== null && $user->can('update', $user->business);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // The state the owner wants, so a double tap can't undo itself.
            'is_open' => ['required', 'boolean'],
        ];
    }
}
