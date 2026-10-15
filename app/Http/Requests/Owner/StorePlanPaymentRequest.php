<?php

namespace App\Http\Requests\Owner;

use App\Enums\Plan;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePlanPaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user?->business !== null && $user->can('update', $user->business);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'plan' => ['required', Rule::in([Plan::Basic->value, Plan::Pro->value])],
            'months' => ['required', 'integer', Rule::in(config('plans.months'))],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'plan.in' => 'Choose Basic or Pro.',
            'months.in' => 'Choose 1, 3, 6 or 12 months.',
        ];
    }
}
