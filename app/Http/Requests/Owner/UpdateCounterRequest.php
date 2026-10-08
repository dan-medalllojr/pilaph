<?php

namespace App\Http\Requests\Owner;

use App\Models\Counter;
use App\Services\PlanUsage;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateCounterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->counter()) === true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('is_active')) {
            $this->merge(['is_active' => $this->boolean('is_active')]);
        }
    }

    /**
     * Fields are optional so the Active switch can save on its own.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => [
                'sometimes',
                'required',
                'string',
                'max:40',
                Rule::unique('counters')
                    ->where('business_id', $this->counter()->business_id)
                    ->ignore($this->counter()->id),
            ],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * Switching a counter on counts toward the plan's limit.
     *
     * @return list<callable(Validator): void>
     */
    public function after(PlanUsage $usage): array
    {
        return [
            function (Validator $validator) use ($usage): void {
                $counter = $this->counter();
                if ($this->boolean('is_active') && ! $counter->is_active && ! $usage->canActivateCounter($counter->business)) {
                    $validator->errors()->add('is_active', $usage->counterLimitMessage($counter->business));
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

    private function counter(): Counter
    {
        $model = $this->route('counter');
        abort_unless($model instanceof Counter, 404);

        return $model;
    }
}
