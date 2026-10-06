<?php

use App\Models\Business;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Support\Carbon;

test('a new business gets a QR token for today', function () {
    Carbon::setTestNow('2026-03-01 23:30:00 UTC'); // already 07:30 on Mar 2 in Manila

    $business = Business::factory()->create();

    expect($business->qr_token)->toHaveLength(32)
        ->and($business->qr_token_date->toDateString())->toBe('2026-03-02')
        ->and($business->today())->toBe('2026-03-02');
});

test('the QR token never appears in serialized output', function () {
    $business = Business::factory()->create();

    expect($business->toArray())->not->toHaveKey('qr_token')
        ->and($business->toJson())->not->toContain($business->qr_token);
});

test('deleting a business removes its queue data and unlinks its owner', function () {
    $owner = User::factory()->owner()->create();
    $business = $owner->business;
    $ticket = Ticket::factory()->for(Service::factory()->for($business))->create();
    Counter::factory()->for($business)->create();

    $business->delete();

    expect(Service::count())->toBe(0)
        ->and(Counter::count())->toBe(0)
        ->and(Ticket::find($ticket->id))->toBeNull()
        ->and($owner->fresh()->business_id)->toBeNull();
});
