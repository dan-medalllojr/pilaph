<?php

namespace App\Http\Requests\Owner;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class UpdateShopPhotoRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user?->business !== null && $user->can('update', $user->business);
    }

    /**
     * The page shrinks photos to 1600 px JPEGs before uploading; these limits
     * catch anything else. No SVG: it could carry scripts.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'photo' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:4096', 'dimensions:min_width=320,min_height=200,max_width=4000,max_height=4000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'photo.mimes' => 'Please choose a JPG, PNG or WebP photo.',
            'photo.max' => 'That photo is too large. Please choose one under 4 MB.',
            'photo.dimensions' => 'Please choose a photo at least 320 × 200 pixels.',
        ];
    }
}
