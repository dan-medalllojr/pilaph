<?php

use App\Models\Business;
use App\Models\Service;
use App\Models\Ticket;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Process\Pool;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

/*
 * Real concurrency: data is committed (not wrapped in a test transaction) and
 * customers join from separate PHP processes released at the same instant.
 */
uses(TestCase::class, DatabaseTruncation::class);

const SIMULTANEOUS_CUSTOMERS = 8;

test('customers joining at the same moment never get the same number', function () {
    $business = Business::factory()->create(['max_waiting' => null]);
    $service = Service::factory()->for($business)->create(['prefix' => 'A']);

    // Every process boots first, then all call CreateTicket at this instant.
    $startAt = microtime(true) + 3;

    $results = Process::pool(function (Pool $pool) use ($business, $service, $startAt) {
        foreach (range(1, SIMULTANEOUS_CUSTOMERS) as $i) {
            $pool->path(base_path())
                ->env([
                    'APP_ENV' => 'testing',
                    'DB_CONNECTION' => 'pgsql',
                    'DB_DATABASE' => 'pilaph_test',
                    'CACHE_STORE' => 'array',
                ])
                ->command([PHP_BINARY, 'tests/Concurrency/join-once.php', (string) $business->id, (string) $service->id, (string) $startAt]);
        }
    })->start()->wait();

    $outputs = collect($results)->map(fn ($result) => trim($result->output()));
    $failures = $outputs->filter(fn (string $output) => ! ctype_digit($output));

    expect($failures->all())->toBe([])
        ->and($outputs->map(fn ($n) => (int) $n)->sort()->values()->all())
        ->toBe(range(1, SIMULTANEOUS_CUSTOMERS))
        ->and(Ticket::query()->where('service_id', $service->id)->count())
        ->toBe(SIMULTANEOUS_CUSTOMERS);
});

test('the queue limit holds when people join different services at once', function () {
    $business = Business::factory()->create(['max_waiting' => 3]);
    $services = Service::factory()->for($business)->count(2)->sequence(['prefix' => 'A'], ['prefix' => 'B'])->create();
    $startAt = microtime(true) + 3;

    $results = Process::pool(function (Pool $pool) use ($business, $services, $startAt) {
        foreach (range(1, SIMULTANEOUS_CUSTOMERS) as $i) {
            $pool->path(base_path())
                ->env([
                    'APP_ENV' => 'testing',
                    'DB_CONNECTION' => 'pgsql',
                    'DB_DATABASE' => 'pilaph_test',
                    'CACHE_STORE' => 'array',
                ])
                ->command([PHP_BINARY, 'tests/Concurrency/join-once.php', (string) $business->id, (string) $services[$i % 2]->id, (string) $startAt]);
        }
    })->start()->wait();

    $joined = collect($results)->filter(fn ($result) => $result->successful())->count();

    expect($joined)->toBe(3)
        ->and(Ticket::query()->where('business_id', $business->id)->count())->toBe(3);
});
