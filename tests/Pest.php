<?php

use App\Models\Business;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| Feature tests run on Laravel's TestCase against the pilaph_test Postgres
| database (see phpunit.xml), refreshed for every test.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

/**
 * Submit the join form as a customer who scanned the shop's QR code.
 *
 * Each call sets the device cookie explicitly (a new device unless one is
 * given), since the test client keeps cookies between requests.
 *
 * @param  array<string, mixed>  $fields
 * @return TestResponse<Response>
 */
function joinQueue(Business $business, array $fields = [], ?string $deviceId = null): TestResponse
{
    return test()
        ->withCookie('pilaph_device', $deviceId ?? Str::random(40))
        ->post(route('queue.tickets.store', $business), array_merge([
            'service_id' => $business->services()->value('id'),
            'customer_name' => 'Maria',
            'idempotency_key' => (string) Str::uuid(),
            'k' => $business->qr_token,
        ], $fields));
}
