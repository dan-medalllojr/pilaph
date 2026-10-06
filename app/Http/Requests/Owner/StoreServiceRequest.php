<?php

namespace App\Http\Requests\Owner;

use App\Models\Service;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreServiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Service::class) === true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('prefix')) {
            $this->merge(['prefix' => strtoupper(trim($this->string('prefix')->value()))]);
        }
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:60'],
            'prefix' => [
                'required',
                'string',
                'regex:/^[A-Z]{1,3}$/',
                Rule::unique('services')->where('business_id', $this->user()?->business_id),
            ],
            'default_minutes' => ['required', 'integer', 'min:1', 'max:240'],
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
}
