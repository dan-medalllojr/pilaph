<?php

namespace App\Http\Requests\Settings;

use App\Concerns\PasswordValidationRules;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ProfileDeleteRequest extends FormRequest
{
    use PasswordValidationRules;

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        // Owners without a password confirm with Google instead (ProfileController).
        if ($this->user()?->hasPassword() === false) {
            return [];
        }

        return [
            'password' => $this->currentPasswordRules(),
        ];
    }
}
