<?php

namespace App\Actions;

use App\Models\Business;
use App\Services\ShopPhotos;
use Illuminate\Http\UploadedFile;

/**
 * Sets, replaces or (with null) removes the photo on the customer join page.
 */
class ChangeShopPhoto
{
    public function __construct(private ShopPhotos $photos) {}

    public function execute(Business $business, ?UploadedFile $photo): void
    {
        // Store the new one first: if that fails, the old photo stays.
        $stored = $photo !== null ? $this->photos->store($business, $photo) : ['photo_path' => null, 'photo_disk' => null];

        $this->photos->delete($business);
        $business->forceFill($stored)->save();
    }
}
