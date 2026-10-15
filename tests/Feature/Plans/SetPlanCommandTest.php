<?php

use App\Enums\Plan;
use App\Models\Business;
use App\Models\User;
use Carbon\CarbonImmutable;

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-15 10:00:00', 'Asia/Manila'));
    $this->business = Business::factory()->onTrial()->create(['name' => 'Juan Barbershop', 'slug' => 'juan-barbershop']);
    $this->owner = User::factory()->owner($this->business)->create(['email' => 'juan@example.com']);
});

test('switches a paid plan on for the months paid, by link name or owner email', function () {
    $this->artisan('plan:set', ['shop' => 'juan-barbershop', 'plan' => 'basic', '--months' => 2])
        ->expectsOutputToContain('Juan Barbershop is now on Basic until Dec 15, 2026')
        ->assertSuccessful();

    $business = $this->business->fresh();
    expect($business->currentPlan())->toBe(Plan::Basic)
        ->and($business->onTrial())->toBeFalse()
        ->and($business->plan_expires_at->toDateString())->toBe('2026-12-15');

    $this->artisan('plan:set', ['shop' => 'JUAN@example.com', 'plan' => 'pro'])->assertSuccessful();
    expect($business->fresh()->currentPlan())->toBe(Plan::Pro);
});

test('renewing early adds the months after the current end date', function () {
    $this->business->forceFill(['plan' => Plan::Basic, 'plan_expires_at' => now()->addDays(3)])->save();

    $this->artisan('plan:set', ['shop' => 'juan-barbershop', 'plan' => 'basic'])
        ->expectsOutputToContain('renewed')
        ->assertSuccessful();

    expect($this->business->fresh()->plan_expires_at->toDateString())->toBe('2026-11-18');
});

test('renewing after the plan ended starts from today', function () {
    $this->business->forceFill(['plan' => Plan::Basic, 'plan_expires_at' => now()->subDays(5)])->save();

    $this->artisan('plan:set', ['shop' => 'juan-barbershop', 'plan' => 'basic'])->assertSuccessful();

    expect($this->business->fresh()->plan_expires_at->toDateString())->toBe('2026-11-15');
});

test('--forever gives a plan with no end date', function () {
    $this->artisan('plan:set', ['shop' => 'juan-barbershop', 'plan' => 'pro', '--forever' => true])->assertSuccessful();

    $business = $this->business->fresh();
    expect($business->plan_expires_at)->toBeNull()
        ->and($business->currentPlan())->toBe(Plan::Pro);
});

test('free ends the paid plan and the trial now', function () {
    $this->artisan('plan:set', ['shop' => 'juan-barbershop', 'plan' => 'free'])->assertSuccessful();

    $business = $this->business->fresh();
    expect($business->currentPlan())->toBe(Plan::Free)
        ->and($business->onTrial())->toBeFalse();
});

test('refuses an unknown shop, plan, number of months, or the demo', function () {
    $this->artisan('plan:set', ['shop' => 'nobody', 'plan' => 'pro'])->assertFailed();
    $this->artisan('plan:set', ['shop' => 'juan-barbershop', 'plan' => 'gold'])->assertFailed();
    $this->artisan('plan:set', ['shop' => 'juan-barbershop', 'plan' => 'pro', '--months' => 0])->assertFailed();
    $this->artisan('plan:set', ['shop' => 'juan-barbershop', 'plan' => 'pro', '--months' => 'two'])->assertFailed();

    Business::factory()->create(['slug' => 'pilaph-demo', 'is_demo' => true]);
    $this->artisan('plan:set', ['shop' => 'pilaph-demo', 'plan' => 'free'])->assertFailed();

    expect($this->business->fresh()->onTrial())->toBeTrue();
});

test('plan:list shows every shop with its plan and end date', function () {
    Business::factory()->create(['is_demo' => true, 'name' => 'Demo Shop']);

    $this->artisan('plan:list')
        ->expectsTable(
            ['Shop', 'Link', 'Owner', 'Plan', 'Ends', 'Customers this month', 'Texts this month'],
            [['Juan Barbershop', 'juan-barbershop', 'juan@example.com', 'Pro (trial)', 'Oct 25, 2026', 0, 0]],
        )
        ->assertSuccessful();
});
