<?php

use App\Enums\Plan;
use App\Enums\TicketStatus;
use App\Models\Business;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use App\Models\User;
use App\Notifications\TicketCalled;
use App\Notifications\TicketNearTurn;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Notification;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    // Mid-month, 2:00 PM in Manila.
    $this->travelTo(CarbonImmutable::parse('2026-10-15 14:00:00', 'Asia/Manila'));
});

/**
 * An owner whose shop is on the given factory state, with a service and a counter.
 */
function shopOn(object $test, callable $state): void
{
    $test->business = $state(Business::factory())->create();
    $test->owner = User::factory()->owner($test->business)->create();
    $test->service = Service::factory()->for($test->business)->create(['prefix' => 'A']);
    $test->chair = Counter::factory()->for($test->business)->create(['name' => 'Chair 1']);
}

/**
 * Tickets that joined this shop on the given day.
 */
function customersOn(Business $business, string $date, int $count, array $attributes = []): void
{
    Ticket::factory()->count($count)->for($business->services()->firstOrFail())->sequence(fn ($sequence) => [
        'number' => $sequence->index + 1,
        'code' => sprintf('A-%03d', $sequence->index + 1),
    ])->create([
        'queue_date' => $date,
        'status' => TicketStatus::Done,
        ...$attributes,
    ]);
}

describe('the plan in effect', function () {
    test('a paid plan until it ends, then Free', function () {
        $business = Business::factory()->onPlan(Plan::Basic, now()->addDays(3))->create();
        expect($business->currentPlan())->toBe(Plan::Basic)->and($business->hasPaidPlan())->toBeTrue();

        $this->travel(4)->days();
        $business->refresh();
        expect($business->currentPlan())->toBe(Plan::Free)
            ->and($business->planLapsed())->toBeTrue()
            ->and($business->limits()->counters)->toBe(1);
    });

    test('a paid plan without an end date never ends', function () {
        $business = Business::factory()->onPlan(Plan::Pro)->create();
        $this->travel(5)->years();

        expect($business->fresh()->currentPlan())->toBe(Plan::Pro);
    });

    test('the trial gives Pro with fewer texts, then Free', function () {
        $business = Business::factory()->onTrial(daysLeft: 2)->create();
        expect($business->currentPlan())->toBe(Plan::Pro)
            ->and($business->onTrial())->toBeTrue()
            ->and($business->limits()->counters)->toBeNull()
            ->and($business->limits()->monthlySms)->toBe(50);

        $this->travel(3)->days();
        expect($business->fresh()->currentPlan())->toBe(Plan::Free);
    });

    test('paying during the trial ends it', function () {
        $business = Business::factory()->onTrial()->create();
        $business->forceFill(['plan' => Plan::Basic, 'plan_expires_at' => now()->addMonth()])->save();

        expect($business->onTrial())->toBeFalse()
            ->and($business->currentPlan())->toBe(Plan::Basic)
            ->and($business->limits()->monthlySms)->toBe(300);
    });

    test('the public demo shows every feature', function () {
        $business = Business::factory()->free()->create(['is_demo' => true]);

        expect($business->currentPlan())->toBe(Plan::Pro);
    });

    test('a new shop starts on the trial', function () {
        $owner = User::factory()->create();

        $this->actingAs($owner)->post(route('business.store'), ['name' => 'Juan Barbershop']);

        $business = $owner->fresh()->business;
        expect($business->onTrial())->toBeTrue()
            ->and($business->trial_ends_at->toDateString())->toBe('2026-10-29');
    });
});

describe('counters', function () {
    test('the Free plan adds and switches on only one counter', function () {
        shopOn($this, fn ($factory) => $factory->free());

        $this->actingAs($this->owner)->post(route('counters.store'), ['name' => 'Chair 2'])
            ->assertSessionHasErrors(['name' => 'The Free plan includes 1 counter at a time. Switch one off, or upgrade under Plan & billing.']);

        $off = Counter::factory()->for($this->business)->create(['name' => 'Chair 3', 'is_active' => false]);
        $this->actingAs($this->owner)->put(route('counters.update', $off), ['is_active' => true])
            ->assertSessionHasErrors('is_active');
        expect($off->fresh()->is_active)->toBeFalse();

        // Switching the first one off frees the place.
        $this->chair->update(['is_active' => false]);
        $this->actingAs($this->owner)->put(route('counters.update', $off), ['is_active' => true])
            ->assertSessionHasNoErrors();
    });

    test('after a downgrade the oldest counters keep working and the rest are locked', function () {
        shopOn($this, fn ($factory) => $factory->onTrial(daysLeft: 1));
        $chair2 = Counter::factory()->for($this->business)->create(['name' => 'Chair 2']);
        Ticket::factory()->for($this->service)->create(['queue_date' => '2026-10-17']);
        Ticket::factory()->for($this->service)->create(['queue_date' => '2026-10-17', 'number' => 2, 'code' => 'A-002']);

        $this->travel(2)->days(); // the trial ended

        $this->actingAs($this->owner)->post(route('dashboard.call-next', $chair2), ['expected_current_ticket_id' => null])
            ->assertSessionHas('inertia.flash_data.toast', fn ($toast) => str_contains($toast['message'], "Chair 2 can't call customers on the Free plan"));
        expect(Ticket::where('status', TicketStatus::Called)->count())->toBe(0);

        $this->actingAs($this->owner)->post(route('dashboard.call-next', $this->chair), ['expected_current_ticket_id' => null]);
        expect(Ticket::where('status', TicketStatus::Called)->sole()->counter_id)->toBe($this->chair->id);

        $this->actingAs($this->owner)->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page
            ->where('queue.counters.0.locked', false)
            ->where('queue.counters.1.locked', true)
            ->where('planNotice.tone', 'warning')
            ->where('planNotice.message', "The Free plan includes 1 counter, so Chair 2 can't call customers. Upgrade, or switch counters off under Counters."));
    });
});

describe('customers a month on the Free plan', function () {
    beforeEach(fn () => shopOn($this, fn ($factory) => $factory->free()));

    test('reaching the limit today keeps today\'s queue open', function () {
        customersOn($this->business, '2026-10-15', 300);

        joinQueue($this->business)->assertSessionHasNoErrors();
        expect(Ticket::count())->toBe(301);

        $this->actingAs($this->owner)->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page
            ->where('queue.business.closed_reason', null)
            ->where('planNotice.tone', 'warning')
            ->where('planNotice.message', fn ($message) => str_contains($message, 'from tomorrow new customers can\'t join until Nov 1')));
    });

    test('from the next day joining is closed until next month', function () {
        customersOn($this->business, '2026-10-14', 300);

        joinQueue($this->business)->assertSessionHasErrors(['queue' => 'Online joining is closed for now. Please ask the staff.']);
        $this->get(route('queue.join', $this->business))
            ->assertInertia(fn (Assert $page) => $page->where('queue.business.closed_reason', 'monthly_limit'));

        $this->travelTo(CarbonImmutable::parse('2026-11-01 08:00:00', 'Asia/Manila'));
        joinQueue($this->business)->assertSessionHasNoErrors();
    });

    test('last month\'s customers don\'t count', function () {
        customersOn($this->business, '2026-09-30', 300);

        joinQueue($this->business)->assertSessionHasNoErrors();
    });

    test('paid plans have no limit', function () {
        $this->business->forceFill(['plan' => Plan::Basic, 'plan_expires_at' => now()->addMonth()])->save();
        customersOn($this->business, '2026-10-14', 300);

        joinQueue($this->business)->assertSessionHasNoErrors();
    });
});

describe('texts', function () {
    beforeEach(fn () => Notification::fake());

    test('the Free plan has no phone field and keeps no numbers', function () {
        shopOn($this, fn ($factory) => $factory->free());

        $this->get(route('queue.join', $this->business))
            ->assertInertia(fn (Assert $page) => $page->where('textsEnabled', false));

        joinQueue($this->business, ['phone' => '0917 123 4567']);
        expect(Ticket::sole()->phone)->toBeNull();

        $this->actingAs($this->owner)->post(route('dashboard.call-next', $this->chair), ['expected_current_ticket_id' => null]);
        Notification::assertNothingSent();
    });

    test('texts stop when the month\'s texts are used up, the called customer first', function () {
        shopOn($this, fn ($factory) => $factory->onPlan(Plan::Basic, now()->addMonth()));
        // 299 of 300 texts sent earlier this month.
        customersOn($this->business, '2026-10-10', 299, ['called_sms_sent_at' => now()->subDays(5), 'phone' => '639170000000']);

        $this->get(route('queue.join', $this->business))
            ->assertInertia(fn (Assert $page) => $page->where('textsEnabled', true));

        $first = Ticket::factory()->for($this->service)->create(['phone' => '639171111111', 'number' => 1, 'code' => 'A-001', 'joined_at' => now()->subMinutes(10)]);
        $second = Ticket::factory()->for($this->service)->create(['phone' => '639172222222', 'number' => 2, 'code' => 'A-002', 'joined_at' => now()->subMinutes(5)]);

        $this->actingAs($this->owner)->post(route('dashboard.call-next', $this->chair), ['expected_current_ticket_id' => null]);

        Notification::assertSentTo($first, TicketCalled::class);
        Notification::assertNotSentTo($second, TicketNearTurn::class);
        expect($second->fresh()->near_sms_sent_at)->toBeNull();

        $this->get(route('queue.join', $this->business))
            ->assertInertia(fn (Assert $page) => $page->where('textsEnabled', false));
        $this->actingAs($this->owner)->get(route('dashboard'))
            ->assertInertia(fn (Assert $page) => $page->where('planNotice.message', "You've used all 300 texts for this month, so customers won't get texts until Nov 1. Upgrade for more."));
    });
});

describe('photo and branding', function () {
    test('the Free plan shows "Queue by PilaPH" and no shop photo', function () {
        shopOn($this, fn ($factory) => $factory->free());
        $this->business->forceFill(['photo_disk' => 'public', 'photo_path' => 'shops/1/photo.jpg'])->save();

        $this->get(route('queue.join', $this->business))->assertInertia(fn (Assert $page) => $page
            ->where('photoUrl', null)
            ->where('branding', true));

        $this->actingAs($this->owner)->get(route('business.edit'))
            ->assertInertia(fn (Assert $page) => $page->where('photoAllowed', false));
    });

    test('paid plans show the photo and drop the PilaPH name', function () {
        shopOn($this, fn ($factory) => $factory->onPlan(Plan::Basic, now()->addMonth()));
        $ticket = Ticket::factory()->for($this->service)->create();

        $this->get(route('queue.join', $this->business))->assertInertia(fn (Assert $page) => $page->where('branding', false));
        $this->get(route('tickets.show', $ticket))->assertInertia(fn (Assert $page) => $page->where('branding', false));
        $this->get(route('display.show', $this->business->display_token))->assertInertia(fn (Assert $page) => $page->where('branding', false));
        $this->actingAs($this->owner)->get(route('qr.show'))->assertInertia(fn (Assert $page) => $page->where('branding', false));
    });
});

describe('the plan banner', function () {
    test('warns a few days before the trial ends', function () {
        shopOn($this, fn ($factory) => $factory->onTrial(daysLeft: 3));

        $this->actingAs($this->owner)->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page
            ->where('planNotice.tone', 'info')
            ->where('planNotice.message', 'Your Pro trial ends in 3 days (Oct 18). After that your shop moves to the Free plan: 1 counter, 300 customers a month and no texts. Choose a plan to keep everything.'));
    });

    test('says nothing early in the trial or on a paid plan', function () {
        shopOn($this, fn ($factory) => $factory->onTrial(daysLeft: 10));
        $this->actingAs($this->owner)->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page->where('planNotice', null));

        $this->business->forceFill(['plan' => Plan::Pro, 'plan_expires_at' => now()->addMonth()])->save();
        $this->actingAs($this->owner)->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page->where('planNotice', null));
    });

    test('reminds the owner to renew, and says when a plan ended', function () {
        shopOn($this, fn ($factory) => $factory->onPlan(Plan::Basic, now()->addDay()));
        $this->actingAs($this->owner)->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page
            ->where('planNotice.message', 'Your Basic plan ends tomorrow. Pay for the next month so nothing changes.'));

        $this->travel(2)->days();
        $this->actingAs($this->owner)->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page
            ->where('planNotice.tone', 'warning')
            ->where('planNotice.message', 'Your Basic plan ended on Oct 16, so your shop is on the Free plan. Renew by Nov 15 to keep your older stats.'));
    });
});

describe('pages', function () {
    test('Plan & billing shows the plan, this month\'s usage and how to pay', function () {
        config(['plans.payment.gcash' => '0917 000 0000', 'plans.payment.account_name' => 'J. Cruz']);
        shopOn($this, fn ($factory) => $factory->onTrial(daysLeft: 10));
        customersOn($this->business, '2026-10-12', 4);

        $this->actingAs($this->owner)->get(route('plan.show'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('plan/show')
            ->where('summary.plan.key', 'pro')
            ->where('summary.status', 'trial')
            ->where('summary.usage.customers', 4)
            ->where('summary.usage.active_counters', 1)
            ->where('summary.limits.monthly_sms', 50)
            ->where('summary.resets_on', '2026-11-01')
            ->where('plans.1.key', 'basic')
            ->where('plans.1.price', 299)
            ->where('payment.gcash', '0917 000 0000')
            ->where('payment.maya', null)
            ->where('payment.reference', $this->business->slug));
    });

    test('the landing page and /pricing show the plans to everyone', function () {
        $this->get(route('home'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('welcome')
            ->has('plans', 3)
            ->where('plans.0.limits.monthly_customers', 300)
            ->where('trial', ['plan' => 'Pro', 'days' => 14]));

        $this->get(route('pricing'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('pricing')
            ->where('plans.2.name', 'Pro')
            ->where('plans.2.price', 799));
    });
});
