<?php

/*
 * Joins the queue once from its own PHP process, for ConcurrentJoinTest.
 *
 * Usage: php join-once.php <business_id> <service_id> <start_at_unix_float>
 * Waits until start_at so every process enters CreateTicket at the same
 * moment, then prints the ticket number (or the error).
 */

use App\Actions\CreateTicket;
use App\Models\Business;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Str;

require __DIR__.'/../../vendor/autoload.php';

$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

[, $businessId, $serviceId, $startAt] = $argv;

$business = Business::query()->findOrFail((int) $businessId);

time_sleep_until((float) $startAt);

try {
    $ticket = app(CreateTicket::class)->execute(
        business: $business,
        serviceId: (int) $serviceId,
        customerName: 'Customer',
        phone: null,
        idempotencyKey: (string) Str::uuid(),
        deviceId: Str::random(40),
        qrToken: $business->qr_token,
    );
    echo $ticket->number;
} catch (Throwable $e) {
    echo 'ERROR: '.$e::class.': '.$e->getMessage();
    exit(1);
}
