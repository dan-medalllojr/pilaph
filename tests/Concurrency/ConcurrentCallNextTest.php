<?php

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Process\Pool;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

/*
 * Real concurrency: committed data, and "Call next" taps from separate PHP
 * processes released at the same instant. The per-counter lock lives in the
 * database cache, shared by all processes as in production.
 */
uses(TestCase::class, DatabaseTruncation::class);

/**
 * @param  list<int>  $counterIds  One process per entry.
 * @return Collection<int, string> Each process's output.
 */
function tapCallNextTogether(array $counterIds): Collection
{
    $startAt = microtime(true) + 3;

    $results = Process::pool(function (Pool $pool) use ($counterIds, $startAt) {
        foreach ($counterIds as $counterId) {
            $pool->path(base_path())
                ->env([
                    'APP_ENV' => 'testing',
                    'DB_CONNECTION' => 'pgsql',
                    'DB_DATABASE' => 'pilaph_test',
                    'CACHE_STORE' => 'database',
                    // Never broadcast to a real Supabase project from tests.
                    'SUPABASE_URL' => '',
                ])
                ->command([PHP_BINARY, 'tests/Concurrency/call-next-once.php', (string) $counterId, (string) $startAt]);
        }
    })->start()->wait();

    return collect($results)->map(fn ($result) => trim($result->output()))->values();
}

test('counters calling next at the same moment never get the same customer', function () {
    $business = Business::factory()->create();
    $service = Service::factory()->for($business)->create(['prefix' => 'A']);
    $counters = Counter::factory()->for($business)->count(4)->create();
    Ticket::factory()->for($service)->count(6)->sequence(fn ($sequence) => [
        'joined_at' => now()->subMinutes(60 - $sequence->index),
    ])->create();

    $outputs = tapCallNextTogether($counters->pluck('id')->all());

    // Four different customers, each called to exactly one counter.
    expect($outputs->filter(fn ($o) => str_starts_with($o, 'A-'))->unique()->count())->toBe(4)
        ->and(Ticket::query()->where('status', TicketStatus::Called)->count())->toBe(4)
        ->and(Ticket::query()->where('status', TicketStatus::Called)->distinct()->count('counter_id'))->toBe(4)
        ->and(Ticket::query()->where('status', TicketStatus::Waiting)->count())->toBe(2);
});

test('a double tap on one counter calls exactly one customer', function () {
    $business = Business::factory()->create();
    $service = Service::factory()->for($business)->create(['prefix' => 'A']);
    $counter = Counter::factory()->for($business)->create();
    Ticket::factory()->for($service)->count(3)->create();

    $outputs = tapCallNextTogether([$counter->id, $counter->id, $counter->id]);

    expect($outputs->filter(fn ($o) => str_starts_with($o, 'A-'))->count())->toBe(1)
        ->and($outputs->filter(fn ($o) => str_contains($o, 'QueueConflict'))->count())->toBe(2)
        ->and(Ticket::query()->where('status', TicketStatus::Called)->count())->toBe(1)
        ->and(Ticket::query()->where('status', TicketStatus::Done)->count())->toBe(0);
});
