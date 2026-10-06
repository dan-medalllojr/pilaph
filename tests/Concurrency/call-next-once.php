<?php

/*
 * Taps "Call next" once from its own PHP process, for ConcurrentCallNextTest.
 *
 * Usage: php call-next-once.php <counter_id> <start_at_unix_float>
 * Waits until start_at so every process taps at the same moment, then prints
 * the called ticket's code, "NOBODY", or the error.
 */

use App\Actions\CallNextTicket;
use App\Models\Counter;
use Illuminate\Contracts\Console\Kernel;

require __DIR__.'/../../vendor/autoload.php';

$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

[, $counterId, $startAt] = $argv;

$counter = Counter::query()->findOrFail((int) $counterId);

time_sleep_until((float) $startAt);

try {
    // Every tap comes from a screen showing the counter as free.
    $result = app(CallNextTicket::class)->execute($counter, null);
    echo $result['called']->code ?? 'NOBODY';
} catch (Throwable $e) {
    echo 'ERROR: '.$e::class.': '.$e->getMessage();
    exit(1);
}
