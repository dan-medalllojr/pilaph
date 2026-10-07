<?php

namespace App\Http\Requests\Owner;

use App\Models\Service;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateServiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->service()) === true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('prefix')) {
            $this->merge(['prefix' => strtoupper(trim($this->string('prefix')->value()))]);
        }

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
            'name' => ['sometimes', 'required', 'string', 'max:60'],
            'prefix' => [
                'sometimes',
                'required',
                'string',
                'regex:/^[A-Z]{1,3}$/',
                Rule::unique('services')
                    ->where('business_id', $this->service()->business_id)
                    ->ignore($this->service()->id),
            ],
            'default_minutes' => ['sometimes', 'required', 'integer', 'min:1', 'max:240'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'prefix.regex' => 'Use 1 to 3 letters, e.g. A or HC.',
            'prefix.unique' => 'Another service already uses this prefix.',
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'default_minutes' => 'minutes per customer',
        ];
    }

    private function service(): Service
    {
        $model = $this->route('service');
        abort_unless($model instanceof Service, 404);

        return $model;
    }
}
