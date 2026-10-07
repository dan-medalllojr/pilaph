<?php

use App\Models\Business;
use App\Models\Service;
use App\Models\User;
use App\Notifications\OwnerAlerts\CustomerJoined;
use App\Notifications\OwnerAlerts\JoinCutoffSoon;
use App\Notifications\OwnerAlerts\QueueAlmostFull;
use App\Services\OwnerAlerts;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

beforeEach(function () {
    Notification::fake();

    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;
    $this->service = Service::factory()->for($this->business)->create(['name' => 'Haircut', 'prefix' => 'A']);
});

function alertsOnFor(User $owner, string $device = 'a'): void
{
    $owner->updatePushSubscription("https://fcm.googleapis.com/fcm/send/device-{$device}", 'p256dh-key', 'auth-token', 'aes128gcm');
}

test('owners with alerts on hear about every new customer', function () {
    alertsOnFor($this->owner);
    $withoutAlerts = User::factory()->owner($this->business)->create();

    joinQueue($this->business, ['customer_name' => 'Ana Reyes']);
    joinQueue($this->business, ['customer_name' => 'Ben Cruz']);

    Notification::assertSentToTimes($this->owner, CustomerJoined::class, 2);
    Notification::assertSentTo($this->owner, CustomerJoined::class, fn (CustomerJoined $alert) => $alert->code === 'A-002'
        && $alert->customerName === 'Ben Cruz'
        && $alert->service === 'Haircut'
        && $alert->waitingCount === 2);
    Notification::assertNotSentTo($withoutAlerts, CustomerJoined::class);
});

test('a repeated join sends no second alert', function () {
    alertsOnFor($this->owner);
    $key = (string) Str::uuid();

    joinQueue($this->business, ['idempotency_key' => $key]);
    joinQueue($this->business, ['idempotency_key' => $key]);

    Notification::assertSentToTimes($this->owner, CustomerJoined::class, 1);
});

test('nothing is queued when no owner has alerts on', function () {
    joinQueue($this->business);

    Notification::assertNothingSent();
});

test('"almost full" fires once, when the line reaches a few spots before the max', function () {
    alertsOnFor($this->owner);
    $this->business->update(['max_waiting' => 10]);

    foreach (range(1, 10) as $i) {
        joinQueue($this->business);
    }

    Notification::assertSentToTimes($this->owner, QueueAlmostFull::class, 1);
    Notification::assertSentTo($this->owner, QueueAlmostFull::class, fn (QueueAlmostFull $alert) => $alert->waitingCount === 9 && $alert->maxWaiting === 10);
});

test('the almost-full point leaves about a tenth of the spots', function (int $max, int $at) {
    expect(OwnerAlerts::almostFullAt($max))->toBe($at);
})->with([
    [30, 27],
    [10, 9],
    [5, 4],
    [100, 90],
]);

test('no "almost full" without a maximum', function () {
    alertsOnFor($this->owner);

    foreach (range(1, 12) as $i) {
        joinQueue($this->business);
    }

    Notification::assertNotSentTo($this->owner, QueueAlmostFull::class);
});

describe('the cutoff reminder', function () {
    beforeEach(function () {
        alertsOnFor($this->owner);
        $this->business->update(['join_cutoff_time' => '19:00']);
    });

    function runRemindersAt(Business $business, string $localTime): void
    {
        test()->travelTo(now($business->timezone)->setTimeFromTimeString($localTime));
        test()->artisan('queue:cutoff-reminders')->assertSuccessful();
    }

    test('comes 30 minutes before the cutoff, once a day', function () {
        runRemindersAt($this->business, '18:29');
        Notification::assertNothingSent();

        runRemindersAt($this->business, '18:30');
        runRemindersAt($this->business, '18:31');
        runRemindersAt($this->business, '18:45');

        Notification::assertSentToTimes($this->owner, JoinCutoffSoon::class, 1);
        Notification::assertSentTo($this->owner, JoinCutoffSoon::class, fn (JoinCutoffSoon $alert) => $alert->minutesLeft === 30
            && $alert->cutoff === '19:00'
            && $alert->waitingCount === 0);
    });

    test('catches up if the scheduler missed the exact minute', function () {
        runRemindersAt($this->business, '18:52');

        Notification::assertSentTo($this->owner, JoinCutoffSoon::class, fn (JoinCutoffSoon $alert) => $alert->minutesLeft === 8);
    });

    test('says nothing after the cutoff, or while paused', function () {
        runRemindersAt($this->business, '19:00');
        $this->business->update(['is_open' => false]);
        runRemindersAt($this->business, '18:40');

        Notification::assertNothingSent();
    });

    test('waits for an owner with alerts, rather than using up the day', function () {
        $this->owner->pushSubscriptions()->delete();
        runRemindersAt($this->business, '18:35');
        alertsOnFor($this->owner);
        runRemindersAt($this->business, '18:40');

        Notification::assertSentToTimes($this->owner, JoinCutoffSoon::class, 1);
    });

    test('runs every minute', function () {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($event) => str_contains((string) $event->command, 'queue:cutoff-reminders'));

        expect($events->first()?->expression)->toBe('* * * * *');
    });
});

test('an alert opens the dashboard and replaces the previous one of its kind', function () {
    $payload = (new CustomerJoined('A-012', 'Ana', 'Haircut', 5))->toWebPush($this->owner, new CustomerJoined('A-012', 'Ana', 'Haircut', 5))->toArray();

    expect($payload)->toMatchArray([
        'title' => 'A-012 joined',
        'body' => 'Ana, Haircut. 5 waiting.',
        'tag' => 'customer-joined',
        'renotify' => true,
        'data' => ['url' => '/dashboard'],
    ]);
});
