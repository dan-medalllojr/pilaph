<?php

use App\Jobs\BroadcastQueueUpdate;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;

beforeEach(function () {
    config([
        'services.supabase.url' => 'https://example.supabase.co',
        'services.supabase.service_role_key' => 'sb_secret_test',
    ]);
    Queue::fake();

    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;
    $this->service = Service::factory()->for($this->business)->create(['prefix' => 'A']);
    $this->chair = Counter::factory()->for($this->business)->create(['name' => 'Chair 1']);
});

/**
 * @return list<BroadcastQueueUpdate>
 */
function pushedBroadcasts(): array
{
    return array_values(Queue::pushed(BroadcastQueueUpdate::class)->all());
}

test('joining broadcasts ticket.joined after the ticket is saved', function () {
    joinQueue($this->business);
    $ticket = Ticket::sole();

    [$job] = pushedBroadcasts();
    expect($job->businessId)->toBe($this->business->id)
        ->and($job->event)->toBe('ticket.joined')
        ->and($job->subject)->toBe(['code' => 'A-001', 'counter' => null, 'status' => 'waiting'])
        ->and($job->ticketUpdates)->toBe([['id' => $ticket->id, 'code' => 'A-001', 'counter' => null, 'status' => 'waiting']])
        ->and($job->afterCommit)->toBeTrue();
});

test('a repeated join broadcasts nothing new', function () {
    $key = (string) Str::uuid();
    joinQueue($this->business, ['idempotency_key' => $key]);
    joinQueue($this->business, ['idempotency_key' => $key]);

    expect(pushedBroadcasts())->toHaveCount(1);
});

test('call next tells the queue and both affected tickets', function () {
    $current = Ticket::factory()->for($this->service)->called($this->chair)->create(['code' => 'A-001']);
    $next = Ticket::factory()->for($this->service)->create(['code' => 'A-002']);

    $this->actingAs($this->owner)->post(route('dashboard.call-next', $this->chair), ['expected_current_ticket_id' => $current->id]);

    [$job] = pushedBroadcasts();
    expect($job->event)->toBe('ticket.called')
        ->and($job->subject)->toBe(['code' => 'A-002', 'counter' => 'Chair 1', 'status' => 'called'])
        ->and($job->ticketUpdates)->toBe([
            ['id' => $current->id, 'code' => 'A-001', 'counter' => null, 'status' => 'done'],
            ['id' => $next->id, 'code' => 'A-002', 'counter' => 'Chair 1', 'status' => 'called'],
        ]);
});

test('recall re-announces the called ticket', function () {
    $ticket = Ticket::factory()->for($this->service)->called($this->chair)->create(['code' => 'A-001']);

    $this->actingAs($this->owner)->post(route('dashboard.tickets.recall', $ticket));

    [$job] = pushedBroadcasts();
    expect($job->event)->toBe('ticket.called')
        ->and($job->subject)->toBe(['code' => 'A-001', 'counter' => 'Chair 1', 'status' => 'called', 'recalled' => true]);
});

test('finishing, cancelling and removing tickets broadcast ticket.updated', function (Closure $act, string $status) {
    $ticket = $act($this);

    [$job] = pushedBroadcasts();
    expect($job->event)->toBe('ticket.updated')
        ->and($job->ticketUpdates)->toBe([['id' => $ticket->id, 'code' => $ticket->code, 'counter' => null, 'status' => $status]]);
})->with([
    'done' => [function ($test) {
        $ticket = Ticket::factory()->for($test->service)->called($test->chair)->create();
        $test->actingAs($test->owner)->post(route('dashboard.tickets.done', $ticket));

        return $ticket;
    }, 'done'],
    'no-show' => [function ($test) {
        $ticket = Ticket::factory()->for($test->service)->called($test->chair)->create();
        $test->actingAs($test->owner)->post(route('dashboard.tickets.no-show', $ticket));

        return $ticket;
    }, 'no_show'],
    'customer cancels' => [function ($test) {
        $ticket = Ticket::factory()->for($test->service)->create();
        $test->post(route('tickets.cancel', $ticket));

        return $ticket;
    }, 'cancelled'],
    'owner removes spam' => [function ($test) {
        $ticket = Ticket::factory()->for($test->service)->create();
        $test->actingAs($test->owner)->post(route('dashboard.tickets.bulk-remove'), ['ticket_ids' => [$ticket->id]]);

        return $ticket;
    }, 'cancelled'],
]);

test('pausing the queue broadcasts queue.toggled', function () {
    $this->actingAs($this->owner)->post(route('dashboard.queue.toggle'), ['is_open' => '0']);

    [$job] = pushedBroadcasts();
    expect($job->event)->toBe('queue.toggled')->and($job->ticketUpdates)->toBe([]);
});

test('actions that change nothing broadcast nothing', function () {
    $waiting = Ticket::factory()->for($this->service)->create();

    $this->actingAs($this->owner)->post(route('dashboard.tickets.done', $waiting)); // not called
    $this->actingAs($this->owner)->post(route('dashboard.tickets.recall', $waiting)); // not called

    expect(pushedBroadcasts())->toBe([]);
});

test('nothing is queued when Supabase is not configured', function () {
    config(['services.supabase.url' => null]);

    joinQueue($this->business);

    expect(Ticket::count())->toBe(1);
    Queue::assertNothingPushed();
});
