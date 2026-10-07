<?php

namespace App\Http\Requests\Settings;

use App\Concerns\PasswordValidationRules;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class PasswordUpdateRequest extends FormRequest
{
    use PasswordValidationRules;

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        // Owners who signed up with Google are setting their first password.
        return [
            ...($this->user()?->hasPassword() === false ? [] : ['current_password' => $this->currentPasswordRules()]),
            'password' => $this->passwordRules(),
        ];
    }
}
