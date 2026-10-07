<?php

use App\Models\Business;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->business = Business::factory()->create(['name' => "Juan's Barbershop"]);
    $this->service = Service::factory()->for($this->business)->create(['prefix' => 'A']);
});

test('every shop gets a short TV link token, kept out of serialized data', function () {
    expect($this->business->display_token)->toMatch('/^[a-hj-km-np-z2-9]{12}$/')
        ->and($this->business->toArray())->not->toHaveKeys(['display_token', 'qr_token']);
});

test('the TV display opens only with the right link', function () {
    $this->get(route('display.show', $this->business->display_token))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('public/display')
            ->where('display.business.name', "Juan's Barbershop")
            ->where('stateUrl', route('display.state', $this->business->display_token)));

    $this->get('/tv/abcdefghjkmn')->assertNotFound();
    $this->get('/tv/abcdefghjkmn/state')->assertNotFound();
    $this->get('/tv/'.$this->business->slug)->assertNotFound();
});

test('the display shows each counter, who is next and the QR code to join', function () {
    [$chair1, $chair2] = Counter::factory()->for($this->business)->count(2)
        ->sequence(['name' => 'Chair 1'], ['name' => 'Chair 2'])->create();
    $retired = Counter::factory()->for($this->business)->inactive()->create(['name' => 'Chair 9']);
    Counter::factory()->for($this->business)->inactive()->create(['name' => 'Old chair']);
    Ticket::factory()->for($this->service)->called($chair1)->create(['code' => 'A-001']);
    Ticket::factory()->for($this->service)->called($retired)->create(['code' => 'A-002']);
    foreach (range(3, 9) as $n) {
        Ticket::factory()->for($this->service)->create(['code' => sprintf('A-%03d', $n), 'joined_at' => now()->subMinutes(30 - $n)]);
    }

    $display = $this->getJson(route('display.state', $this->business->display_token))->assertOk()->json();

    expect($display['counters'])->toBe([
        ['name' => 'Chair 1', 'code' => 'A-001'],
        ['name' => 'Chair 2', 'code' => null],
        // Switched off, but still serving someone.
        ['name' => 'Chair 9', 'code' => 'A-002'],
    ])
        ->and($display['next_codes'])->toBe(['A-003', 'A-004', 'A-005', 'A-006', 'A-007'])
        ->and($display['waiting_count'])->toBe(7)
        ->and($display['join']['url'])->toBe(route('queue.join', ['business' => $this->business->slug, 'k' => $this->business->qr_token]))
        ->and($display['join']['image'])->toStartWith('data:image/svg+xml;base64,');
});

test('the QR code is hidden while new customers cannot join', function () {
    $this->business->update(['is_open' => false]);

    $display = $this->getJson(route('display.state', $this->business->display_token))->json();

    expect($display['join'])->toBeNull()
        ->and($display['business']['closed_reason'])->toBe('paused');
});

test('the display never shows names or phone numbers', function () {
    $chair = Counter::factory()->for($this->business)->create();
    Ticket::factory()->for($this->service)->called($chair)->create(['customer_name' => 'Maria Clara', 'phone' => '639171234567']);
    Ticket::factory()->for($this->service)->create(['customer_name' => 'Jose Rizal', 'phone' => '639181234567']);

    $body = $this->get(route('display.state', $this->business->display_token))->getContent();

    expect($body)->not->toContain('Maria')->not->toContain('Rizal')->not->toContain('63917');
});
