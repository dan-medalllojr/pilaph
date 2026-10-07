<?php

use App\Models\Business;
use App\Models\User;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;
});

function uploadPhoto(object $test, UploadedFile $photo): TestResponse
{
    return $test->actingAs($test->owner)->post(route('business.photo.store'), ['photo' => $photo]);
}

describe('on the local disk (no Storage bucket set)', function () {
    beforeEach(fn () => Storage::fake('public'));

    test('an owner adds a photo, shown on settings and the join page', function () {
        uploadPhoto($this, UploadedFile::fake()->image('shop.jpg', 1600, 900))
            ->assertRedirect(route('business.edit'))
            ->assertSessionHasNoErrors();

        $business = $this->business->fresh();
        expect($business->photo_disk)->toBe('public')
            ->and($business->photo_path)->toMatch("#^shops/{$business->id}/[a-z0-9]{20}\\.jpg$#");
        Storage::disk('public')->assertExists($business->photo_path);

        $url = Storage::disk('public')->url($business->photo_path);
        $this->get(route('business.edit'))->assertInertia(fn (Assert $page) => $page->where('photoUrl', $url));
        $this->get(route('queue.join', $business))->assertInertia(fn (Assert $page) => $page->where('photoUrl', $url));
    });

    test('a new photo replaces the old file; removing deletes it', function () {
        uploadPhoto($this, UploadedFile::fake()->image('first.jpg', 800, 600));
        $first = $this->business->fresh()->photo_path;

        uploadPhoto($this, UploadedFile::fake()->image('second.png', 800, 600));
        $second = $this->business->fresh()->photo_path;

        Storage::disk('public')->assertMissing($first);
        Storage::disk('public')->assertExists($second);
        expect($second)->toEndWith('.png');

        $this->delete(route('business.photo.destroy'))->assertRedirect(route('business.edit'));
        Storage::disk('public')->assertMissing($second);
        expect($this->business->fresh()->photo_path)->toBeNull();
    });

    test('only real photos of a sensible size are accepted', function (Closure $file) {
        uploadPhoto($this, $file())->assertSessionHasErrors('photo');

        expect($this->business->fresh()->photo_path)->toBeNull();
    })->with([
        'a PDF' => fn () => UploadedFile::fake()->create('menu.pdf', 100, 'application/pdf'),
        'an SVG (could carry scripts)' => fn () => UploadedFile::fake()->createWithContent('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
        'too small' => fn () => UploadedFile::fake()->image('tiny.jpg', 100, 80),
        'too large' => fn () => UploadedFile::fake()->image('huge.jpg', 1600, 900)->size(6000),
    ]);

    test('no photo means none on the join page', function () {
        $this->get(route('queue.join', $this->business))->assertInertia(fn (Assert $page) => $page->where('photoUrl', null));
    });
});

describe('in a Supabase Storage bucket', function () {
    beforeEach(function () {
        config([
            'services.supabase.url' => 'https://example.supabase.co',
            'services.supabase.service_role_key' => 'sb_secret_test',
            'services.supabase.storage_bucket' => 'shop-photos',
        ]);
        $this->storageFails = false;
        Http::fake(['example.supabase.co/storage/*' => fn () => $this->storageFails
            ? Http::response(['error' => 'Bucket not found'], 400)
            : Http::response(['Key' => 'ok'])]);
    });

    test('photos are uploaded with the secret key and served from the public URL', function () {
        uploadPhoto($this, UploadedFile::fake()->image('shop.jpg', 1600, 900))->assertSessionHasNoErrors();

        $business = $this->business->fresh();
        expect($business->photo_disk)->toBe('supabase');

        Http::assertSent(fn (Request $request) => $request->method() === 'POST'
            && $request->url() === "https://example.supabase.co/storage/v1/object/shop-photos/{$business->photo_path}"
            && $request->header('apikey') === ['sb_secret_test']
            // New secret keys never go in Authorization (only the legacy JWT does).
            && ! $request->hasHeader('Authorization')
            && $request->header('Content-Type') === ['image/jpeg']);

        $this->get(route('queue.join', $business))->assertInertia(fn (Assert $page) => $page
            ->where('photoUrl', "https://example.supabase.co/storage/v1/object/public/shop-photos/{$business->photo_path}"));
    });

    test('replacing a photo deletes the old one from the bucket', function () {
        uploadPhoto($this, UploadedFile::fake()->image('first.jpg', 800, 600));
        $first = $this->business->fresh()->photo_path;

        uploadPhoto($this, UploadedFile::fake()->image('second.jpg', 800, 600));

        Http::assertSent(fn (Request $request) => $request->method() === 'DELETE'
            && $request->url() === "https://example.supabase.co/storage/v1/object/shop-photos/{$first}");
    });

    test('if the upload fails, the old photo stays', function () {
        uploadPhoto($this, UploadedFile::fake()->image('first.jpg', 800, 600));
        $first = $this->business->fresh()->photo_path;
        $this->storageFails = true;

        $this->withoutExceptionHandling();
        expect(fn () => uploadPhoto($this, UploadedFile::fake()->image('second.jpg', 800, 600)))
            ->toThrow(RequestException::class);

        expect($this->business->fresh()->photo_path)->toBe($first);
    });
});

test('the demo account cannot upload a photo', function () {
    config(['demo.enabled' => true]);
    Storage::fake('public');
    $this->post(route('demo.store'));

    $this->from(route('business.edit'))->post(route('business.photo.store'), ['photo' => UploadedFile::fake()->image('x.jpg', 800, 600)])
        ->assertRedirect(route('business.edit'));

    expect(Business::query()->where('is_demo', true)->sole()->photo_path)->toBeNull();
});
