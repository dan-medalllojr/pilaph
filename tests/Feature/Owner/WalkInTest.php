<?php

use App\Enums\TicketStatus;
use App\Jobs\BroadcastQueueUpdate;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use App\Models\User;
use App\Notifications\OwnerAlerts\CustomerJoined;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;
    $this->haircut = Service::factory()->for($this->business)->create(['prefix' => 'A', 'name' => 'Haircut']);
});

/**
 * @param  array<string, mixed>  $fields
 */
function addWalkIn(User $user, array $fields = []): TestResponse
{
    return test()->actingAs($user)->post(route('dashboard.tickets.walk-in'), array_merge([
        'service_id' => $user->business->services()->value('id'),
        'customer_name' => 'Lola Nena',
        'idempotency_key' => (string) Str::uuid(),
    ], $fields));
}

test('staff add a walk-in: next number, no phone or device, and the number for the dialog', function () {
    joinQueue($this->business);

    addWalkIn($this->owner)
        ->assertRedirect(route('dashboard'))
        ->assertInertiaFlash('walkIn', ['code' => 'A-002', 'service' => 'Haircut']);

    expect(Ticket::query()->where('walk_in', true)->sole())
        ->code->toBe('A-002')
        ->customer_name->toBe('Lola Nena')
        ->status->toBe(TicketStatus::Waiting)
        ->phone->toBeNull()
        ->device_id->toBeNull();

    // A QR join after it carries on from the walk-in's number.
    joinQueue($this->business);
    expect(Ticket::query()->latest('number')->value('code'))->toBe('A-003');
});

test('the name is optional', function () {
    addWalkIn($this->owner, ['customer_name' => '  '])->assertSessionHasNoErrors();

    expect(Ticket::sole()->customer_name)->toBe('Walk-in');
});

test('works while the queue is paused, closed for the day or full: staff decide in person', function () {
    $this->business->update(['is_open' => false, 'join_cutoff_time' => '21:30', 'max_waiting' => 1]);
    Ticket::factory()->for($this->haircut)->create();
    $this->travelTo(CarbonImmutable::parse('2026-03-02 22:00:00', 'Asia/Manila'));

    addWalkIn($this->owner)->assertSessionHasNoErrors();

    expect(Ticket::query()->where('walk_in', true)->count())->toBe(1);
});

test('a double tap adds the walk-in once', function () {
    $key = (string) Str::uuid();

    addWalkIn($this->owner, ['idempotency_key' => $key]);
    addWalkIn($this->owner, ['idempotency_key' => $key])
        ->assertInertiaFlash('walkIn.code', 'A-001');

    expect(Ticket::count())->toBe(1);
});

test('only the shop\'s own switched-on services', function () {
    $off = Service::factory()->for($this->business)->inactive()->create();
    $elsewhere = Service::factory()->create();

    addWalkIn($this->owner, ['service_id' => $off->id])->assertSessionHasErrors('service_id');
    addWalkIn($this->owner, ['service_id' => $elsewhere->id])->assertSessionHasErrors('service_id');

    expect(Ticket::count())->toBe(0);
});

test('staff can add walk-ins too', function () {
    $staff = User::factory()->staff($this->business)->create();

    addWalkIn($staff)->assertSessionHasNoErrors();

    expect(Ticket::sole()->business_id)->toBe($this->business->id);
});

test('guests and people without a shop cannot add walk-ins', function () {
    $this->post(route('dashboard.tickets.walk-in'), ['service_id' => $this->haircut->id, 'idempotency_key' => (string) Str::uuid()])
        ->assertRedirect(route('login'));

    $this->actingAs(User::factory()->create())
        ->post(route('dashboard.tickets.walk-in'), ['service_id' => $this->haircut->id, 'idempotency_key' => (string) Str::uuid()])
        ->assertRedirect(route('business.setup'));

    expect(Ticket::count())->toBe(0);
});

test('the TV and phones hear about it, but the owner gets no push alert', function () {
    config([
        'services.supabase.url' => 'https://example.supabase.co',
        'services.supabase.service_role_key' => 'sb_secret_test',
    ]);
    Queue::fake();
    Notification::fake();
    $this->owner->updatePushSubscription('https://fcm.googleapis.com/fcm/send/device-a', 'p256dh-key', 'auth-token', 'aes128gcm');

    addWalkIn($this->owner);

    $jobs = Queue::pushed(BroadcastQueueUpdate::class);
    expect($jobs)->toHaveCount(1)
        ->and($jobs->first()->event)->toBe('ticket.joined');
    Notification::assertNotSentTo($this->owner, CustomerJoined::class);
});

test('the dashboard lists the services to choose from and marks walk-ins', function () {
    Service::factory()->for($this->business)->inactive()->create();
    $chair = Counter::factory()->for($this->business)->create();
    addWalkIn($this->owner);
    joinQueue($this->business);

    $this->actingAs($this->owner)->get(route('dashboard'))
        ->assertInertia(fn (Assert $page) => $page
            ->where('queue.services', [['id' => $this->haircut->id, 'name' => 'Haircut']])
            ->where('queue.waiting.0.walk_in', true)
            ->where('queue.waiting.1.walk_in', false));

    $this->actingAs($this->owner)->post(route('dashboard.call-next', $chair));

    $this->actingAs($this->owner)->getJson(route('dashboard.state'))
        ->assertJsonPath('counters.0.current.walk_in', true);
});
