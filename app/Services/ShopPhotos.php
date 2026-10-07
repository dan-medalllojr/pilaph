<?php

namespace App\Services;

use App\Models\Business;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Shop photos for the customer join page. Kept in a public Supabase Storage
 * bucket when SUPABASE_STORAGE_BUCKET is set (production: Railway's disk is
 * wiped on every deploy), otherwise on the local `public` disk.
 */
class ShopPhotos
{
    public function __construct(private SupabaseApi $supabase) {}

    /**
     * Stores the photo and returns where it went.
     *
     * @return array{photo_path: string, photo_disk: string}
     *
     * @throws RequestException when Supabase Storage refuses it.
     */
    public function store(Business $business, UploadedFile $photo): array
    {
        $extension = match ($photo->getMimeType()) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };
        // A new name each time, so browsers and CDNs never show an old photo.
        $path = "shops/{$business->id}/".Str::lower(Str::random(20)).".{$extension}";

        if ($this->usesSupabase()) {
            $this->supabase->request()
                ->timeout(20)
                ->withBody((string) $photo->getContent(), (string) $photo->getMimeType())
                ->post($this->supabase->url("storage/v1/object/{$this->bucket()}/{$path}"))
                ->throw();

            return ['photo_path' => $path, 'photo_disk' => 'supabase'];
        }

        Storage::disk('public')->putFileAs(dirname($path), $photo, basename($path));

        return ['photo_path' => $path, 'photo_disk' => 'public'];
    }

    /**
     * Removes the shop's current photo file, if it has one. A file that's
     * already gone is fine.
     */
    public function delete(Business $business): void
    {
        if ($business->photo_path === null) {
            return;
        }

        if ($business->photo_disk === 'supabase') {
            if ($this->usesSupabase()) {
                $this->supabase->request()
                    ->timeout(10)
                    ->delete($this->supabase->url("storage/v1/object/{$this->bucket()}/{$business->photo_path}"));
            }

            return;
        }

        Storage::disk('public')->delete($business->photo_path);
    }

    public function url(Business $business): ?string
    {
        return match (true) {
            $business->photo_path === null => null,
            $business->photo_disk === 'supabase' => $this->supabase->url("storage/v1/object/public/{$this->bucket()}/{$business->photo_path}"),
            default => Storage::disk('public')->url($business->photo_path),
        };
    }

    private function usesSupabase(): bool
    {
        return $this->supabase->configured() && $this->bucket() !== '';
    }

    private function bucket(): string
    {
        return (string) config('services.supabase.storage_bucket');
    }
}
