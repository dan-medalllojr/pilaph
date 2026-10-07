<?php

use App\Jobs\BroadcastQueueUpdate;
use App\Models\Business;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use App\Services\PublicQueueState;
use App\Services\SupabaseApi;
use App\Services\SupabaseBroadcaster;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    config([
        'services.supabase.url' => 'https://example.supabase.co/',
        'services.supabase.service_role_key' => 'sb_secret_test',
    ]);

    $this->business = Business::factory()->create();
    $this->service = Service::factory()->for($this->business)->create(['prefix' => 'A']);
    $this->chair = Counter::factory()->for($this->business)->create(['name' => 'Chair 1']);
});

function runBroadcast(BroadcastQueueUpdate $job): void
{
    $job->handle(app(SupabaseBroadcaster::class), app(PublicQueueState::class));
}

test('sends the queue snapshot and per-ticket messages to Supabase in one request', function () {
    Http::fake(['*' => Http::response([], 202)]);
    $waiting = Ticket::factory()->for($this->service)->create(['code' => 'A-002']);
    $called = Ticket::factory()->for($this->service)->called($this->chair)->create(['code' => 'A-001']);

    runBroadcast(new BroadcastQueueUpdate(
        $this->business->id,
        'ticket.called',
        ['code' => 'A-001', 'counter' => 'Chair 1', 'status' => 'called'],
        [['id' => $called->id, 'code' => 'A-001', 'counter' => 'Chair 1', 'status' => 'called']],
    ));

    Http::assertSentCount(1);
    Http::assertSent(function (Request $request) use ($called) {
        [$queue, $ticket] = $request['messages'];

        return $request->url() === 'https://example.supabase.co/realtime/v1/api/broadcast'
            && $request->hasHeader('apikey', 'sb_secret_test')
            // New secret keys must not go in the Authorization header.
            && ! $request->hasHeader('Authorization')
            && $queue['topic'] === "queue:{$this->business->id}"
            && $queue['event'] === 'ticket.called'
            && $queue['payload']['ticket'] === ['code' => 'A-001', 'counter' => 'Chair 1', 'status' => 'called']
            && $queue['payload']['queue']['waiting_codes'] === ['A-002']
            && $queue['payload']['queue']['now_serving'] === [['counter' => 'Chair 1', 'code' => 'A-001']]
            && $ticket['topic'] === "ticket:{$called->id}"
            && $ticket['event'] === 'ticket.called'
            && $ticket['payload'] === ['code' => 'A-001', 'counter' => 'Chair 1', 'status' => 'called'];
    });
});

test('the legacy service_role JWT is also sent as a bearer token', function () {
    config(['services.supabase.service_role_key' => 'eyJhbGciOiJIUzI1NiJ9.test.sig']);
    Http::fake(['*' => Http::response([], 202)]);

    runBroadcast(new BroadcastQueueUpdate($this->business->id, 'queue.toggled'));

    Http::assertSent(fn (Request $request) => $request->hasHeader('apikey', 'eyJhbGciOiJIUzI1NiJ9.test.sig')
        && $request->hasHeader('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.test.sig'));
});

test('the shared queue channel carries no names, phones or ticket IDs', function () {
    Http::fake(['*' => Http::response([], 202)]);
    $ticket = Ticket::factory()->for($this->service)->create([
        'code' => 'A-001',
        'customer_name' => 'Maria Clara',
        'phone' => '639171234567',
    ]);

    runBroadcast(new BroadcastQueueUpdate(
        $this->business->id,
        'ticket.joined',
        ['code' => 'A-001', 'counter' => null, 'status' => 'waiting'],
        [['id' => $ticket->id, 'code' => 'A-001', 'counter' => null, 'status' => 'waiting']],
    ));

    Http::assertSent(function (Request $request) use ($ticket) {
        $queueMessage = json_encode($request['messages'][0]);

        return ! str_contains($queueMessage, 'Maria Clara')
            && ! str_contains($queueMessage, '639171234567')
            && ! str_contains($queueMessage, $ticket->id)
            && ! str_contains(json_encode($request['messages']), 'Maria Clara');
    });
});

test('a failed request throws so the queue retries the job', function () {
    Http::fake(['*' => Http::response(['message' => 'boom'], 500)]);

    runBroadcast(new BroadcastQueueUpdate($this->business->id, 'queue.toggled'));
})->throws(RequestException::class);

test('the job retries a few times, quickly', function () {
    $job = new BroadcastQueueUpdate($this->business->id, 'queue.toggled');

    expect($job->tries)->toBe(3)
        ->and($job->backoff)->toBe([1, 5]);
});

test('without Supabase configured nothing is sent', function () {
    config(['services.supabase.service_role_key' => '']);
    Http::fake();

    runBroadcast(new BroadcastQueueUpdate($this->business->id, 'queue.toggled'));

    Http::assertNothingSent();
});

test('a project URL copied with /rest/v1/ on the end still works', function () {
    config(['services.supabase.url' => 'https://example.supabase.co/rest/v1/']);

    expect(app(SupabaseApi::class)->url('realtime/v1/api/broadcast'))
        ->toBe('https://example.supabase.co/realtime/v1/api/broadcast');
});
