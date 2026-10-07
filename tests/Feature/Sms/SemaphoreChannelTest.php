<?php

use App\Enums\SmsStatus;
use App\Enums\SmsType;
use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Counter;
use App\Models\Service;
use App\Models\SmsLog;
use App\Models\Ticket;
use App\Notifications\Channels\SemaphoreChannel;
use App\Notifications\TicketCalled;
use App\Notifications\TicketNearTurn;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

beforeEach(function () {
    $this->business = Business::factory()->create(['name' => "Juan's Barbershop"]);
    $service = Service::factory()->for($this->business)->create(['prefix' => 'A']);
    $chair = Counter::factory()->for($this->business)->create(['name' => 'Chair 2']);
    $this->ticket = Ticket::factory()->for($service)->called($chair)->create([
        'code' => 'A-024',
        'customer_name' => 'Ana Peña',
        'phone' => '639171234567',
    ]);
});

function useSemaphore(): void
{
    config([
        'services.sms.driver' => 'semaphore',
        'services.semaphore.api_key' => 'test-semaphore-key',
        'services.semaphore.sender_name' => 'PILAPH',
    ]);
}

function semaphoreAccepts(string $status = 'Pending'): void
{
    Http::fake(['api.semaphore.co/*' => Http::response([[
        'message_id' => 1234567,
        'recipient' => '639171234567',
        'status' => $status,
    ]])]);
}

test('the called text is short and names the counter and shop', function () {
    expect((new TicketCalled)->toSms($this->ticket))->toBe("A-024, please proceed to Chair 2 at Juan's Barbershop.");
});

test('the near text greets by first name, says how close, and links the ticket', function (int $ahead, string $phrase) {
    $message = (new TicketNearTurn($ahead))->toSms($this->ticket);

    expect($message)->toStartWith("Hi Ana, {$phrase} Juan's Barbershop (A-024). Please head back now. ")
        ->toEndWith(route('tickets.show', $this->ticket));
})->with([
    [0, "you're next at"],
    [1, '1 person ahead of you at'],
    [3, '3 people ahead of you at'],
]);

test('texts stay in one plain SMS, even with long or accented names', function () {
    $this->business->update(['name' => 'Peñafrancia Dental and Orthodontic Clinic of Naga City — Main Branch']);
    $this->ticket->update(['customer_name' => 'Ñoño Ángeles']);
    $ticket = $this->ticket->fresh();

    foreach ([new TicketCalled, new TicketNearTurn(2)] as $text) {
        $message = $text->toSms($ticket);
        expect(strlen($message))->toBeLessThanOrEqual(160)
            ->and(mb_check_encoding($message, 'ASCII'))->toBeTrue();
    }

    expect((new TicketNearTurn(2))->toSms($ticket))->toStartWith('Hi Nono, 2 people ahead of you at Penafrancia')
        ->toEndWith(route('tickets.show', $ticket));
});

test('with the log driver, texts are written to the log and recorded, never sent', function () {
    Log::spy();

    $this->ticket->notifyNow(new TicketCalled);

    Log::shouldHaveReceived('info')->withArgs(fn (string $line) => str_contains($line, '63917*****67') && str_contains($line, 'A-024, please proceed'));
    expect(SmsLog::sole())
        ->status->toBe(SmsStatus::Logged)
        ->type->toBe(SmsType::Called)
        ->phone->toBe('639171234567');
});

test('Semaphore gets the number, message, key and sender name', function () {
    useSemaphore();
    semaphoreAccepts();

    $this->ticket->notifyNow(new TicketCalled);

    Http::assertSent(fn (Request $request) => $request->url() === 'https://api.semaphore.co/api/v4/messages'
        && $request['apikey'] === 'test-semaphore-key'
        && $request['number'] === '639171234567'
        && $request['message'] === "A-024, please proceed to Chair 2 at Juan's Barbershop."
        && $request['sendername'] === 'PILAPH');
    expect(SmsLog::sole())
        ->status->toBe(SmsStatus::Sent)
        ->provider_message_id->toBe('1234567')
        ->provider_response->not->toContain('test-semaphore-key');
});

test('without an approved sender name, texts go out as Semaphore\'s default', function () {
    useSemaphore();
    config(['services.semaphore.sender_name' => '']);
    semaphoreAccepts();

    $this->ticket->notifyNow(new TicketCalled);

    Http::assertSent(fn (Request $request) => ! isset($request['sendername']));
});

test('a refusal or failure is recorded without retrying', function (Closure $fake, string $recorded) {
    useSemaphore();
    $fake();

    $this->ticket->notifyNow(new TicketCalled);

    expect(SmsLog::sole())->status->toBe(SmsStatus::Failed)
        ->and(SmsLog::sole()->provider_response)->toContain($recorded);
})->with([
    'bad request' => [fn () => Http::fake(['api.semaphore.co/*' => Http::response(['number' => ['The number format is invalid.']], 422)]), 'number format is invalid'],
    'unapproved sender name' => [fn () => Http::fake(['api.semaphore.co/*' => Http::response(['sendername' => ['The selected sendername is invalid.']])]), 'sendername is invalid'],
    'Semaphore marks it failed' => [fn () => semaphoreAccepts('Failed'), '"status":"Failed"'],
    // No answer: it may have gone out, so never retry (no double texts).
    'no answer' => [fn () => Http::fake(['api.semaphore.co/*' => fn () => throw new ConnectionException('timed out')]), 'No answer from Semaphore'],
]);

test('a Semaphore server error is recorded and retried', function () {
    useSemaphore();
    Http::fake(['api.semaphore.co/*' => Http::response('Service unavailable', 503)]);

    expect(fn () => $this->ticket->notifyNow(new TicketCalled))->toThrow(RequestException::class);
    expect(SmsLog::sole()->status)->toBe(SmsStatus::Failed);
});

test('a missing API key fails safely', function () {
    useSemaphore();
    config(['services.semaphore.api_key' => '']);

    $this->ticket->notifyNow(new TicketCalled);

    Http::assertNothingSent();
    expect(SmsLog::sole()->provider_response)->toContain('SEMAPHORE_API_KEY is empty');
});

test('a text that no longer applies by the time it is sent is dropped', function () {
    $this->ticket->update(['status' => TicketStatus::Done]);

    $this->ticket->notifyNow(new TicketCalled);
    $this->ticket->notifyNow(new TicketNearTurn(1));

    expect(SmsLog::count())->toBe(0);
});

test('the channel is the one texts go through', function () {
    expect((new TicketCalled)->via($this->ticket))->toBe([SemaphoreChannel::class]);
});
