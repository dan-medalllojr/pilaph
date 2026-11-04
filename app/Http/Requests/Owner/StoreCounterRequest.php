<?php

namespace App\Http\Requests\Owner;

use App\Models\Counter;
use App\Services\PlanUsage;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreCounterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Counter::class) === true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => [
                'required',
                'string',
                'max:40',
                Rule::unique('counters')->where('business_id', $this->user()?->business_id),
            ],
        ];
    }

    /**
     * New counters start switched on, so they count toward the plan's limit.
     *
     * @return list<callable(Validator): void>
     */
    public function after(PlanUsage $usage): array
    {
        return [
            function (Validator $validator) use ($usage): void {
                $business = $this->user()?->business;
                if ($business !== null && ! $usage->canActivateCounter($business)) {
                    $validator->errors()->add('name', $usage->counterLimitMessage($business));
                }
            },
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.unique' => 'You already have a counter with this name.',
        ];
    }
}
