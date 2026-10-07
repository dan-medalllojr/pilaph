<?php

use App\Enums\TicketStatus;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

test('ticket IDs are random v4 UUIDs', function () {
    $ticket = Ticket::factory()->create();

    expect(Str::isUuid($ticket->id))->toBeTrue()
        ->and($ticket->id[14])->toBe('4');
});

test('status is cast to the TicketStatus enum', function () {
    $ticket = Ticket::factory()->called()->create();

    expect($ticket->fresh()->status)->toBe(TicketStatus::Called)
        ->and($ticket->counter->business_id)->toBe($ticket->business_id);
});

test('the active scope only returns waiting and called tickets', function () {
    $service = Service::factory()->create();
    Ticket::factory()->for($service)->create();
    Ticket::factory()->for($service)->called()->create();
    Ticket::factory()->for($service)->done()->create();
    Ticket::factory()->for($service)->noShow()->create();
    Ticket::factory()->for($service)->cancelled()->create();

    expect(Ticket::active()->pluck('status')->all())
        ->toEqualCanonicalizing([TicketStatus::Waiting, TicketStatus::Called]);
});

test('the same number cannot be used twice for a service on the same day', function () {
    $first = Ticket::factory()->create(['number' => 24]);

    Ticket::factory()->for($first->service)->create([
        'number' => 24,
        'queue_date' => $first->queue_date,
    ]);
})->throws(UniqueConstraintViolationException::class);

test('numbers restart freely on another day or for another service', function () {
    $first = Ticket::factory()->create(['number' => 1]);

    $nextDay = Ticket::factory()->for($first->service)->create([
        'number' => 1,
        'queue_date' => $first->queue_date->copy()->addDay(),
    ]);
    $otherService = Ticket::factory()
        ->for(Service::factory()->for($first->business))
        ->create(['number' => 1, 'queue_date' => $first->queue_date]);

    expect($nextDay->exists)->toBeTrue()
        ->and($otherService->exists)->toBeTrue();
});

test('an idempotency key can only create one ticket', function () {
    $first = Ticket::factory()->create();

    Ticket::factory()->create(['idempotency_key' => $first->idempotency_key]);
})->throws(UniqueConstraintViolationException::class);

test('the database rejects an unknown status', function () {
    $ticket = Ticket::factory()->create();

    DB::table('tickets')->where('id', $ticket->id)->update(['status' => 'served']);
})->throws(QueryException::class, 'tickets_status_check');

test('a service with tickets cannot be deleted', function () {
    $ticket = Ticket::factory()->create();

    $ticket->service->delete();
})->throws(QueryException::class, 'tickets_service_id_foreign');

test('a counter that served tickets cannot be deleted', function () {
    $ticket = Ticket::factory()->called()->create();

    Counter::findOrFail($ticket->counter_id)->delete();
})->throws(QueryException::class, 'tickets_counter_id_foreign');

test('device and idempotency details stay out of serialized output', function () {
    $ticket = Ticket::factory()->create();

    expect($ticket->toArray())
        ->not->toHaveKey('device_id')
        ->not->toHaveKey('idempotency_key');
});
