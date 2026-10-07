<?php

namespace App\Http\Requests\Owner;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class UpdateBusinessSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user?->business !== null && $user->can('update', $user->business);
    }

    /**
     * An unticked checkbox is simply missing from the form data.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'rotate_qr_daily' => $this->boolean('rotate_qr_daily'),
        ]);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:80'],
            'near_threshold' => ['required', 'integer', 'min:1', 'max:20'],
            'max_waiting' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'join_cutoff_time' => ['nullable', 'date_format:H:i'],
            'rotate_qr_daily' => ['required', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'near_threshold' => 'near-turn position',
            'max_waiting' => 'queue limit',
            'join_cutoff_time' => 'join cutoff',
        ];
    }
}
