<?php

use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use App\Models\User;
use App\Notifications\TicketCalled;
use App\Notifications\TicketNearTurn;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

beforeEach(function () {
    Notification::fake();

    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;
    $this->business->update(['near_threshold' => 2]);
    $this->service = Service::factory()->for($this->business)->create(['prefix' => 'A']);
    $this->chair = Counter::factory()->for($this->business)->create(['name' => 'Chair 1']);
});

/**
 * @param  list<bool>  $phones  One waiting ticket per entry, oldest first; true = has a phone.
 * @return list<Ticket>
 */
function lineWithPhones(Service $service, array $phones): array
{
    return array_map(
        fn (int $i) => Ticket::factory()->for($service)->create([
            'code' => sprintf('A-%03d', $i + 1),
            'number' => $i + 1,
            'phone' => $phones[$i] ? '63917000000'.$i : null,
            'joined_at' => now()->subMinutes(30 - $i),
        ]),
        array_keys($phones),
    );
}

function callNextAtChair(object $test, ?string $expected = null): void
{
    $test->actingAs($test->owner)->post(route('dashboard.call-next', $test->chair), ['expected_current_ticket_id' => $expected]);
}

test('calling a customer texts them, and texts everyone now near the front', function () {
    [$first, $second, $third, $fourth] = lineWithPhones($this->service, [true, true, true, true]);

    callNextAtChair($this);

    Notification::assertSentTo($first, TicketCalled::class);
    Notification::assertSentTo($second, TicketNearTurn::class, fn ($text) => $text->peopleAhead === 0);
    Notification::assertSentTo($third, TicketNearTurn::class, fn ($text) => $text->peopleAhead === 1);
    Notification::assertNotSentTo($fourth, TicketNearTurn::class);
    expect($first->fresh()->called_sms_sent_at)->not->toBeNull()
        ->and($second->fresh()->near_sms_sent_at)->not->toBeNull()
        ->and($fourth->fresh()->near_sms_sent_at)->toBeNull();
});

test('each customer gets each text only once', function () {
    [$first, $second, $third, $fourth] = lineWithPhones($this->service, [true, true, true, true]);

    callNextAtChair($this);
    callNextAtChair($this, $first->id);
    // Recall: they're called again on screen, but not texted again.
    $this->actingAs($this->owner)->post(route('dashboard.tickets.recall', $second));

    Notification::assertSentToTimes($first, TicketCalled::class, 1);
    Notification::assertSentToTimes($second, TicketNearTurn::class, 1);
    Notification::assertSentToTimes($second, TicketCalled::class, 1);
    Notification::assertSentToTimes($third, TicketNearTurn::class, 1);
    Notification::assertSentToTimes($fourth, TicketNearTurn::class, 1);
});

test('customers without a phone number get no texts', function () {
    [$first, $second] = lineWithPhones($this->service, [false, false]);

    callNextAtChair($this);

    Notification::assertNothingSent();
    expect($first->fresh()->called_sms_sent_at)->toBeNull()
        ->and($second->fresh()->near_sms_sent_at)->toBeNull();
});

test('texts are queued, not sent while the owner waits', function () {
    expect(new TicketCalled)->toBeInstanceOf(ShouldQueue::class)
        ->and((new TicketCalled)->afterCommit)->toBeTrue();
});
