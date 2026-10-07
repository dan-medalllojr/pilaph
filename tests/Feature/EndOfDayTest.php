<?php

use App\Actions\RunEndOfDayCleanup;
use App\Enums\TicketStatus;
use App\Jobs\BroadcastQueueUpdate;
use App\Models\Business;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Queue;

beforeEach(function () {
    $this->business = Business::factory()->create();
    $this->service = Service::factory()->for($this->business)->create(['prefix' => 'A']);
    $this->chair = Counter::factory()->for($this->business)->create();
    $this->yesterday = now('Asia/Manila')->subDay()->toDateString();
});

function ticketOn(string $date, Service $service, array $attributes = [], ?Counter $calledTo = null): Ticket
{
    $factory = Ticket::factory()->for($service);

    return ($calledTo !== null ? $factory->called($calledTo) : $factory)->create(['queue_date' => $date, ...$attributes]);
}

test("yesterday's leftover tickets are closed; today's are untouched", function () {
    $waiting = ticketOn($this->yesterday, $this->service);
    $called = ticketOn($this->yesterday, $this->service, [], $this->chair);
    $done = ticketOn($this->yesterday, $this->service, ['status' => TicketStatus::Done, 'completed_at' => now()->subDay()]);
    $today = ticketOn($this->business->today(), $this->service);

    $result = app(RunEndOfDayCleanup::class)->execute($this->business);

    expect($result)->toBe(['closed' => 2, 'rotated' => false])
        ->and($waiting->fresh()->status)->toBe(TicketStatus::Cancelled)
        ->and($called->fresh()->status)->toBe(TicketStatus::NoShow)
        ->and($called->fresh()->completed_at)->not->toBeNull()
        ->and($done->fresh()->status)->toBe(TicketStatus::Done)
        ->and($today->fresh()->status)->toBe(TicketStatus::Waiting);
});

test('the QR code changes once a day, only for shops that turned it on', function () {
    $rotating = Business::factory()->create(['rotate_qr_daily' => true]);
    $rotating->forceFill(['qr_token_date' => $this->yesterday])->save();
    $oldToken = $rotating->qr_token;
    $this->business->forceFill(['qr_token_date' => $this->yesterday])->save();
    $fixedToken = $this->business->qr_token;

    $this->artisan('queue:end-day')->assertSuccessful();

    $rotating->refresh();
    expect($rotating->qr_token)->not->toBe($oldToken)
        ->and($rotating->qr_token_date->toDateString())->toBe($rotating->today())
        ->and($this->business->fresh()->qr_token)->toBe($fixedToken);

    // Running again the same day changes nothing.
    $this->artisan('queue:end-day')->assertSuccessful();
    expect($rotating->fresh()->qr_token)->toBe($rotating->qr_token);
});

test('an old QR code stops working after the change', function () {
    $this->business->update(['rotate_qr_daily' => true]);
    $this->business->forceFill(['qr_token_date' => $this->yesterday])->save();
    $oldToken = $this->business->qr_token;

    app(RunEndOfDayCleanup::class)->execute($this->business);

    joinQueue($this->business->fresh(), ['k' => $oldToken])->assertSessionHasErrors('k');
});

test('the day ending is broadcast, so customer pages and the TV catch up', function () {
    config(['services.supabase.url' => 'https://example.supabase.co', 'services.supabase.service_role_key' => 'sb_secret_test']);
    Queue::fake();
    $waiting = ticketOn($this->yesterday, $this->service);

    app(RunEndOfDayCleanup::class)->execute($this->business);

    $jobs = Queue::pushed(BroadcastQueueUpdate::class);
    expect($jobs)->toHaveCount(1)
        ->and($jobs->first()->event)->toBe('queue.reset')
        ->and($jobs->first()->ticketUpdates)->toBe([['id' => $waiting->id, 'code' => $waiting->code, 'counter' => null, 'status' => 'cancelled']]);
});

test('a quiet night broadcasts nothing', function () {
    config(['services.supabase.url' => 'https://example.supabase.co', 'services.supabase.service_role_key' => 'sb_secret_test']);
    Queue::fake();

    app(RunEndOfDayCleanup::class)->execute($this->business);

    Queue::assertNothingPushed();
});

test('a ticket from a day that ended says the queue closed, not that they left', function () {
    $ticket = ticketOn($this->yesterday, $this->service);
    app(RunEndOfDayCleanup::class)->execute($this->business);

    $this->getJson(route('tickets.state', $ticket))
        ->assertJsonPath('status', 'cancelled')
        ->assertJsonPath('past_day', true);

    $todays = ticketOn($this->business->today(), $this->service);
    $this->getJson(route('tickets.state', $todays))->assertJsonPath('past_day', false);
});

test('the cleanup runs every hour', function () {
    $events = collect(app(Schedule::class)->events())
        ->filter(fn ($event) => str_contains((string) $event->command, 'queue:end-day'));

    expect($events)->toHaveCount(1)
        ->and($events->first()->expression)->toBe('0 * * * *');
});
