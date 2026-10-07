<?php

namespace App\Http\Requests\Owner;

use App\Models\Counter;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.unique' => 'You already have a counter with this name.',
        ];
    }
}
