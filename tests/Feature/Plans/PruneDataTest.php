<?php

use App\Enums\Plan;
use App\Enums\SmsStatus;
use App\Enums\SmsType;
use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Service;
use App\Models\SmsLog;
use App\Models\Ticket;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-15 03:15:00', 'Asia/Manila'));
});

function ticketFrom(Business $business, string $date, array $attributes = []): Ticket
{
    $service = $business->services()->first() ?? Service::factory()->for($business)->create();

    return Ticket::factory()->for($service)->create([
        'queue_date' => $date,
        'status' => TicketStatus::Done,
        'customer_name' => 'Maria Santos',
        'phone' => '639171234567',
        ...$attributes,
    ]);
}

test('names and phone numbers are erased a week after the queue day; the counts stay', function () {
    $business = Business::factory()->create();
    $old = ticketFrom($business, '2026-10-07');
    $recent = ticketFrom($business, '2026-10-08');
    $text = SmsLog::create([
        'ticket_id' => $old->id,
        'phone' => '639171234567',
        'type' => SmsType::Called,
        'message' => 'Hi Maria, it\'s your turn',
        'status' => SmsStatus::Sent,
    ]);
    $recentText = SmsLog::create([
        'ticket_id' => $recent->id,
        'phone' => '639171234567',
        'type' => SmsType::Called,
        'message' => 'Hi Maria, it\'s your turn',
        'status' => SmsStatus::Sent,
    ]);

    $this->artisan('data:prune')->assertSuccessful();

    expect($old->fresh())
        ->customer_name->toBe('')
        ->phone->toBeNull()
        ->status->toBe(TicketStatus::Done)
        ->code->toBe($old->code)
        ->and($recent->fresh())
        ->customer_name->toBe('Maria Santos')
        ->phone->toBe('639171234567')
        ->and(SmsLog::find($text->id))->toBeNull()
        ->and(SmsLog::find($recentText->id))->not->toBeNull();
});

test('history older than the plan keeps is deleted', function (callable $state, string $kept, string $deleted) {
    $business = $state(Business::factory())->create();
    $keptTicket = ticketFrom($business, $kept);
    $deletedTicket = ticketFrom($business, $deleted);

    $this->artisan('data:prune')->assertSuccessful();

    expect(Ticket::find($keptTicket->id))->not->toBeNull()
        ->and(Ticket::find($deletedTicket->id))->toBeNull();
})->with([
    'Free: 30 days' => [fn ($factory) => $factory->free(), '2026-09-15', '2026-09-14'],
    'Basic: 6 months' => [fn ($factory) => $factory->onPlan(Plan::Basic, now()->addMonth()), '2026-04-15', '2026-04-14'],
    'Pro: a year' => [fn ($factory) => $factory->onPlan(Plan::Pro, now()->addMonth()), '2025-10-15', '2025-10-14'],
    // Paying late never loses data: an ended plan's history stays a while.
    'Basic ended 10 days ago' => [fn ($factory) => $factory->onPlan(Plan::Basic, now()->subDays(10)), '2026-04-15', '2026-04-14'],
    'Basic ended 40 days ago' => [fn ($factory) => $factory->onPlan(Plan::Basic, now()->subDays(40)), '2026-09-15', '2026-09-14'],
]);

test('each shop keeps its own history', function () {
    $free = Business::factory()->free()->create();
    $pro = Business::factory()->onPlan(Plan::Pro)->create();
    ticketFrom($free, '2026-08-01');
    $proTicket = ticketFrom($pro, '2026-08-01');

    $this->artisan('data:prune')->assertSuccessful();

    expect(Ticket::pluck('id')->all())->toBe([$proTicket->id]);
});

test('running it again changes nothing', function () {
    $business = Business::factory()->free()->create();
    ticketFrom($business, '2026-10-01');
    ticketFrom($business, '2026-08-01');

    $this->artisan('data:prune')->expectsOutputToContain('Erased names and numbers from 1 tickets; deleted 1 old tickets')->assertSuccessful();
    $this->artisan('data:prune')->expectsOutputToContain('Erased names and numbers from 0 tickets; deleted 0 old tickets')->assertSuccessful();
});

test('expired cache entries are removed', function () {
    config(['cache.default' => 'database']);
    DB::table('cache')->insert([
        ['key' => 'old', 'value' => 'x', 'expiration' => now()->subMinute()->getTimestamp()],
        ['key' => 'fresh', 'value' => 'x', 'expiration' => now()->addHour()->getTimestamp()],
    ]);

    $this->artisan('data:prune')->assertSuccessful();

    expect(DB::table('cache')->pluck('key')->all())->toBe(['fresh']);
});

test('it runs every night with the other clean-ups', function () {
    $this->artisan('schedule:list')
        ->expectsOutputToContain('data:prune')
        ->expectsOutputToContain('queue:prune-failed --hours=168')
        ->expectsOutputToContain('auth:clear-resets')
        ->assertSuccessful();
});
