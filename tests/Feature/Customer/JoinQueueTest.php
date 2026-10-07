<?php

use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Service;
use App\Models\Ticket;
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->business = Business::factory()->create();
    $this->haircut = Service::factory()->for($this->business)->create(['prefix' => 'A', 'name' => 'Haircut']);
});

describe('the join page', function () {
    test('asks people to scan the QR code unless the link has the current token', function (?string $token) {
        $this->get(route('queue.join', ['business' => $this->business, 'k' => $token]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('public/join')
                ->where('qrToken', null)
                ->where('queue.business.name', $this->business->name));
    })->with(['no token' => null, 'wrong token' => 'not-the-token']);

    test('shows the form, the current wait and sets a device cookie when scanned', function () {
        $this->get(route('queue.join', ['business' => $this->business, 'k' => $this->business->qr_token]))
            ->assertOk()
            ->assertCookie('pilaph_device')
            ->assertInertia(fn (Assert $page) => $page
                ->where('qrToken', $this->business->qr_token)
                ->where('existingTicket', null)
                ->where('queue.business.closed_reason', null)
                ->where('queue.services.0.name', 'Haircut'));
    });

    test('links back to the ticket this phone already has', function () {
        $deviceId = Str::random(40);
        joinQueue($this->business, deviceId: $deviceId);
        $ticket = Ticket::sole();

        $this->withCookie('pilaph_device', $deviceId)
            ->get(route('queue.join', ['business' => $this->business, 'k' => $this->business->qr_token]))
            ->assertInertia(fn (Assert $page) => $page
                ->where('existingTicket', ['id' => $ticket->id, 'code' => 'A-001']));
    });
});

describe('joining', function () {
    test('creates a waiting ticket and opens its page', function () {
        $response = joinQueue($this->business, [
            'customer_name' => '  Maria  ',
            'phone' => '0917 123 4567',
        ]);

        $ticket = Ticket::sole();
        $response->assertRedirect(route('tickets.show', $ticket));
        expect($ticket)
            ->code->toBe('A-001')
            ->number->toBe(1)
            ->status->toBe(TicketStatus::Waiting)
            ->customer_name->toBe('Maria')
            ->phone->toBe('639171234567')
            ->queue_date->toDateString()->toBe($this->business->today());
    });

    test('numbers count up per service and restart the next day', function () {
        $beard = Service::factory()->for($this->business)->create(['prefix' => 'B']);

        joinQueue($this->business);
        joinQueue($this->business);
        joinQueue($this->business, ['service_id' => $beard->id]);
        $this->travel(1)->days();
        joinQueue($this->business);

        expect(Ticket::orderBy('created_at')->pluck('code')->all())
            ->toBe(['A-001', 'A-002', 'B-001', 'A-001']);
    });

    test('submitting the same form twice creates one ticket', function () {
        $key = (string) Str::uuid();
        $first = joinQueue($this->business, ['idempotency_key' => $key]);
        $second = joinQueue($this->business, ['idempotency_key' => $key]);

        expect(Ticket::count())->toBe(1);
        $first->assertRedirect(route('tickets.show', Ticket::sole()));
        $second->assertRedirect(route('tickets.show', Ticket::sole()));
    });

    test('a phone holds one active ticket per shop', function () {
        $deviceId = Str::random(40);
        joinQueue($this->business, deviceId: $deviceId);
        joinQueue($this->business, deviceId: $deviceId)
            ->assertRedirect(route('tickets.show', Ticket::sole()));

        expect(Ticket::count())->toBe(1);
    });

    test('a phone number holds one active ticket per shop, even from another device', function () {
        joinQueue($this->business, ['phone' => '09171234567']);
        joinQueue($this->business, ['phone' => '+63 917 123 4567']);

        expect(Ticket::count())->toBe(1);
    });

    test('the same phone can join again once its ticket is finished', function () {
        $deviceId = Str::random(40);
        joinQueue($this->business, deviceId: $deviceId);
        Ticket::sole()->update(['status' => TicketStatus::Done]);

        joinQueue($this->business, deviceId: $deviceId);

        expect(Ticket::pluck('code')->sort()->values()->all())->toBe(['A-001', 'A-002']);
    });
});

describe('joining is refused', function () {
    test('without the current QR token', function () {
        joinQueue($this->business, ['k' => 'old-token'])
            ->assertSessionHasErrors(['k' => 'Scan the QR code at the shop to join the queue.']);

        expect(Ticket::count())->toBe(0);
    });

    test('while the queue is paused', function () {
        $this->business->update(['is_open' => false]);

        joinQueue($this->business)->assertSessionHasErrors('queue');
        expect(Ticket::count())->toBe(0);
    });

    test('after the join cutoff', function () {
        $this->business->update(['join_cutoff_time' => '21:30']);
        $this->travelTo(CarbonImmutable::parse('2026-03-02 21:30:00', 'Asia/Manila'));

        joinQueue($this->business)->assertSessionHasErrors(['queue' => 'The queue is closed for today.']);
        expect(Ticket::count())->toBe(0);
    });

    test('but works just before the cutoff', function () {
        $this->business->update(['join_cutoff_time' => '21:30']);
        $this->travelTo(CarbonImmutable::parse('2026-03-02 21:29:00', 'Asia/Manila'));

        joinQueue($this->business)->assertSessionHasNoErrors();
        expect(Ticket::count())->toBe(1);
    });

    test('when the queue is full', function () {
        $this->business->update(['max_waiting' => 2]);
        joinQueue($this->business);
        joinQueue($this->business);

        joinQueue($this->business)->assertSessionHasErrors('queue');
        expect(Ticket::count())->toBe(2);
    });

    test('for a switched-off service or another shop\'s service', function () {
        $off = Service::factory()->for($this->business)->inactive()->create();
        $elsewhere = Service::factory()->create();

        joinQueue($this->business, ['service_id' => $off->id])->assertSessionHasErrors('service_id');
        joinQueue($this->business, ['service_id' => $elsewhere->id])->assertSessionHasErrors('service_id');
        expect(Ticket::count())->toBe(0);
    });

    test('when a bot fills in the hidden field', function () {
        joinQueue($this->business, ['website' => 'https://spam.example'])
            ->assertSessionHasErrors('website');

        expect(Ticket::count())->toBe(0);
    });

    test('with a number that is not a PH mobile', function () {
        joinQueue($this->business, ['phone' => '(02) 8123 4567'])
            ->assertSessionHasErrors(['phone' => 'Enter a mobile number like 0917 123 4567.']);
    });

    test('after too many joins from one network in a minute', function () {
        foreach (range(1, 20) as $attempt) {
            joinQueue($this->business)->assertRedirect();
        }

        joinQueue($this->business)->assertTooManyRequests();
    });
});
