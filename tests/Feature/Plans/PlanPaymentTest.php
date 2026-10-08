<?php

use App\Actions\ActivatePlan;
use App\Enums\PaymentStatus;
use App\Enums\Plan;
use App\Models\Business;
use App\Models\PlanPayment;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

const HITPAY_CREATE = 'https://api.sandbox.hit-pay.com/v1/payment-requests';
const CHECKOUT_URL = 'https://securecheckout.sandbox.hit-pay.com/payment-request/@pilaph/req-123/checkout';

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-15 10:00:00', 'Asia/Manila'));
    config(['services.hitpay.api_key' => 'test-api-key', 'services.hitpay.salt' => 'test-salt', 'services.hitpay.sandbox' => true]);

    $this->business = Business::factory()->free()->create(['name' => 'Juan Barbershop']);
    $this->owner = User::factory()->owner($this->business)->create(['email' => 'juan@example.com', 'name' => 'Juan']);
});

function hitPayCreates(): void
{
    Http::fake([HITPAY_CREATE => Http::response(['id' => 'req-123', 'url' => CHECKOUT_URL, 'status' => 'pending'], 201)]);
}

function startPayment(object $test, string $plan = 'basic', int $months = 3): TestResponse
{
    // fresh(): the shop as it is now, not as an earlier request loaded it.
    return $test->actingAs($test->owner->fresh())->post(route('plan.payments.store'), ['plan' => $plan, 'months' => $months]);
}

/**
 * HitPay's payment request for a payment, as its webhook and API describe it.
 */
function hitPayRecord(PlanPayment $payment, string $status = 'completed', array $overrides = []): array
{
    return [
        'id' => $payment->hitpay_request_id,
        'reference_number' => $payment->id,
        'amount' => $payment->amount,
        'currency' => 'php',
        'status' => $status,
        'payments' => [['id' => 'pay-456', 'status' => 'succeeded', 'payment_type' => 'qrph_netbank']],
        ...$overrides,
    ];
}

function hitPayWebhook(object $test, array $data, ?string $salt = 'test-salt'): TestResponse
{
    $body = json_encode($data);
    $headers = ['CONTENT_TYPE' => 'application/json', 'HTTP_HITPAY_EVENT_TYPE' => 'completed', 'HTTP_HITPAY_EVENT_OBJECT' => 'payment_request'];
    if ($salt !== null) {
        $headers['HTTP_HITPAY_SIGNATURE'] = hash_hmac('sha256', $body, $salt);
    }

    return $test->call('POST', route('webhooks.hitpay'), [], [], [], $headers, $body);
}

function pendingPayment(Business $business, Plan $plan = Plan::Basic, int $months = 3): PlanPayment
{
    return PlanPayment::create([
        'business_id' => $business->id,
        'plan' => $plan,
        'months' => $months,
        'amount' => number_format($plan->price() * $months, 2, '.', ''),
        'status' => PaymentStatus::Pending,
        'hitpay_request_id' => 'req-'.str()->random(8),
        'checkout_url' => CHECKOUT_URL,
    ]);
}

describe('starting a payment', function () {
    test('records it and sends the owner to HitPay\'s QR Ph checkout', function () {
        hitPayCreates();

        startPayment($this, 'basic', 3)->assertRedirect(CHECKOUT_URL);

        $payment = PlanPayment::sole();
        expect($payment)
            ->status->toBe(PaymentStatus::Pending)
            ->plan->toBe(Plan::Basic)
            ->months->toBe(3)
            ->amount->toBe('897.00')
            ->hitpay_request_id->toBe('req-123')
            ->user_id->toBe($this->owner->id);

        Http::assertSent(fn (Request $request) => $request->url() === HITPAY_CREATE
            && $request->hasHeader('X-BUSINESS-API-KEY', 'test-api-key')
            && $request['amount'] === '897.00'
            && $request['currency'] === 'PHP'
            && $request['payment_methods'] === ['qrph_netbank']
            && $request['reference_number'] === $payment->id
            && $request['redirect_url'] === route('plan.payments.show', $payment)
            && $request['email'] === 'juan@example.com'
            && str_contains($request['purpose'], 'Basic, 3 months: Juan Barbershop'));
    });

    test('HITPAY_PAYMENT_METHODS can change how owners pay (the sandbox has no QR Ph)', function () {
        config(['services.hitpay.payment_methods' => ['card']]);
        hitPayCreates();

        startPayment($this)->assertRedirect(CHECKOUT_URL);

        Http::assertSent(fn (Request $request) => $request['payment_methods'] === ['card']);
    });

    test('in an Inertia visit, the browser goes to HitPay\'s page', function () {
        hitPayCreates();

        $this->actingAs($this->owner)
            ->withHeaders(['X-Inertia' => 'true'])
            ->post(route('plan.payments.store'), ['plan' => 'pro', 'months' => 1])
            ->assertStatus(409)
            ->assertHeader('X-Inertia-Location', CHECKOUT_URL);
    });

    test('only Basic or Pro, for 1, 3, 6 or 12 months', function (array $fields, string $field) {
        Http::fake();

        $this->actingAs($this->owner)->post(route('plan.payments.store'), $fields)->assertSessionHasErrors($field);

        expect(PlanPayment::count())->toBe(0);
        Http::assertNothingSent();
    })->with([
        'Free' => [['plan' => 'free', 'months' => 1], 'plan'],
        '2 months' => [['plan' => 'basic', 'months' => 2], 'months'],
        '24 months' => [['plan' => 'pro', 'months' => 24], 'months'],
    ]);

    test('not a cheaper plan while a dearer one runs, nor a plan without an end date', function () {
        Http::fake();
        $this->business->forceFill(['plan' => Plan::Pro, 'plan_expires_at' => now()->addDays(10)])->save();

        startPayment($this, 'basic')->assertSessionHasErrors(['plan' => "You're on Pro until Oct 25, 2026. You can switch to Basic after that."]);

        $this->business->forceFill(['plan_expires_at' => null])->save();
        startPayment($this, 'pro')->assertSessionHasErrors(['plan' => "Your Pro plan has no end date, so there's nothing to pay."]);

        Http::assertNothingSent();
    });

    test('the demo can\'t buy a plan', function () {
        Http::fake();
        $this->business->forceFill(['is_demo' => true])->save();
        $this->owner->forceFill(['email' => config('demo.email')])->save();

        startPayment($this);

        expect(PlanPayment::count())->toBe(0);
        Http::assertNothingSent();
    });

    test('if HitPay fails, the owner is told, nothing is charged, and HitPay\'s reason is logged', function () {
        $reason = 'The selected payment method (qrph_netbank) is unavailable for your account or the currency is invalid. Please check the payment method you selected.';
        Http::fake([HITPAY_CREATE => Http::response(['error_code' => 'validation_error', 'message' => $reason], 422)]);
        Log::spy();

        startPayment($this)->assertSessionHasErrors(['plan' => "Couldn't start the payment. Please try again in a moment."]);

        Log::shouldHaveReceived('warning')->withArgs(fn ($message, $context) => $context['status'] === 422 && str_contains($context['hitpay'], $reason));

        expect(PlanPayment::sole()->status)->toBe(PaymentStatus::Failed)
            ->and($this->business->fresh()->currentPlan())->toBe(Plan::Free);
    });

    test('without HitPay set up, there is no online payment', function () {
        config(['services.hitpay.api_key' => null]);
        Http::fake();

        startPayment($this)->assertNotFound();
        $this->actingAs($this->owner)->get(route('plan.show'))
            ->assertInertia(fn (Assert $page) => $page->where('online', false)->where('options', []));
    });
});

test('only HITPAY_SANDBOX=false uses HitPay\'s live API; empty or missing stays in the sandbox', function (?string $value, string $host) {
    $value === null ? putenv('HITPAY_SANDBOX') : putenv("HITPAY_SANDBOX={$value}");
    $_ENV['HITPAY_SANDBOX'] = $_SERVER['HITPAY_SANDBOX'] = $value;
    if ($value === null) {
        unset($_ENV['HITPAY_SANDBOX'], $_SERVER['HITPAY_SANDBOX']);
    }
    config(['services.hitpay' => [...(require config_path('services.php'))['hitpay'], 'api_key' => 'k', 'salt' => 's']]);
    Http::fake(["{$host}/*" => Http::response(['id' => 'req-123', 'url' => CHECKOUT_URL])]);

    startPayment($this)->assertRedirect(CHECKOUT_URL);

    Http::assertSent(fn (Request $request) => str_starts_with($request->url(), "https://{$host}/v1/"));
})->with([
    'missing' => [null, 'api.sandbox.hit-pay.com'],
    'empty' => ['', 'api.sandbox.hit-pay.com'],
    'true' => ['true', 'api.sandbox.hit-pay.com'],
    'false' => ['false', 'api.hit-pay.com'],
])->after(function () {
    putenv('HITPAY_SANDBOX=true');
    $_ENV['HITPAY_SANDBOX'] = $_SERVER['HITPAY_SANDBOX'] = 'true';
});

describe('HitPay\'s webhook', function () {
    test('a signed "completed" switches the plan on, once', function () {
        $payment = pendingPayment($this->business);

        hitPayWebhook($this, hitPayRecord($payment))->assertNoContent();

        $business = $this->business->fresh();
        expect($business->currentPlan())->toBe(Plan::Basic)
            ->and($business->plan_expires_at->toDateString())->toBe('2027-01-15')
            ->and($payment->fresh())
            ->status->toBe(PaymentStatus::Paid)
            ->hitpay_payment_id->toBe('pay-456')
            ->plan_ends_at->toDateString()->toBe('2027-01-15');

        // HitPay sending it again changes nothing.
        hitPayWebhook($this, hitPayRecord($payment))->assertNoContent();
        expect($this->business->fresh()->plan_expires_at->toDateString())->toBe('2027-01-15');
    });

    test('an unsigned or wrongly signed request is refused', function (?string $salt) {
        $payment = pendingPayment($this->business);

        hitPayWebhook($this, hitPayRecord($payment), $salt)->assertUnauthorized();

        expect($payment->fresh()->status)->toBe(PaymentStatus::Pending)
            ->and($this->business->fresh()->currentPlan())->toBe(Plan::Free);
    })->with(['no signature' => null, 'wrong salt' => 'guessed-salt']);

    test('a payment that doesn\'t match ours switches nothing on', function (array $overrides) {
        $payment = pendingPayment($this->business);

        hitPayWebhook($this, hitPayRecord($payment, overrides: $overrides))->assertNoContent();

        expect($payment->fresh()->status)->toBe(PaymentStatus::Pending)
            ->and($this->business->fresh()->currentPlan())->toBe(Plan::Free);
    })->with([
        'less money' => [['amount' => '1.00']],
        'another currency' => [['currency' => 'sgd']],
        'another payment request' => [['id' => 'req-someone-else']],
    ]);

    test('an amount from ₱1,000 up, which HitPay writes with a comma, still matches', function () {
        $payment = pendingPayment($this->business, Plan::Pro, 12);

        hitPayWebhook($this, hitPayRecord($payment, overrides: ['amount' => '9,588.00']))->assertNoContent();

        expect($payment->fresh()->status)->toBe(PaymentStatus::Paid)
            ->and($this->business->fresh()->currentPlan())->toBe(Plan::Pro);
    });

    test('payments that aren\'t PilaPH plan payments are ignored', function () {
        hitPayWebhook($this, ['id' => 'req-shop-sale', 'reference_number' => 'ORDER-1001', 'status' => 'completed', 'amount' => '50.00', 'currency' => 'php'])
            ->assertNoContent();
    });

    test('a failed payment is marked failed', function () {
        $payment = pendingPayment($this->business);

        hitPayWebhook($this, hitPayRecord($payment, 'failed'))->assertNoContent();

        expect($payment->fresh()->status)->toBe(PaymentStatus::Failed);
    });
});

describe('coming back from HitPay', function () {
    test('asks HitPay, and switches the plan on if it\'s paid', function () {
        $payment = pendingPayment($this->business);
        Http::fake(["api.sandbox.hit-pay.com/v1/payment-requests/{$payment->hitpay_request_id}" => Http::response(hitPayRecord($payment))]);

        $this->actingAs($this->owner)->get(route('plan.payments.show', $payment).'?reference='.$payment->hitpay_request_id.'&status=completed')
            ->assertRedirect(route('plan.show'))
            ->assertSessionHas('inertia.flash_data.toast', fn ($toast) => $toast['message'] === 'Payment received. Your shop is on Basic until Jan 15, 2027.');

        expect($payment->fresh()->status)->toBe(PaymentStatus::Paid);
    });

    test('counts a big payment HitPay reports with a thousands comma', function () {
        $payment = pendingPayment($this->business, Plan::Basic, 12);
        Http::fake(["api.sandbox.hit-pay.com/v1/payment-requests/{$payment->hitpay_request_id}" => Http::response(hitPayRecord($payment, overrides: ['amount' => '3,588.00']))]);

        $this->actingAs($this->owner)->get(route('plan.payments.show', $payment))
            ->assertSessionHas('inertia.flash_data.toast', fn ($toast) => $toast['type'] === 'success');

        expect($payment->fresh()->status)->toBe(PaymentStatus::Paid);
    });

    test('never trusts the link\'s "status=completed"', function () {
        $payment = pendingPayment($this->business);
        Http::fake(["api.sandbox.hit-pay.com/v1/payment-requests/{$payment->hitpay_request_id}" => Http::response(hitPayRecord($payment, 'pending'))]);

        $this->actingAs($this->owner)->get(route('plan.payments.show', $payment).'?status=completed')
            ->assertSessionHas('inertia.flash_data.toast', fn ($toast) => $toast['type'] === 'info');

        expect($payment->fresh()->status)->toBe(PaymentStatus::Pending)
            ->and($this->business->fresh()->currentPlan())->toBe(Plan::Free);
    });

    test('a payment the webhook already counted needs no check', function () {
        $payment = pendingPayment($this->business);
        hitPayWebhook($this, hitPayRecord($payment));
        Http::fake();

        $this->actingAs($this->owner)->get(route('plan.payments.show', $payment))
            ->assertSessionHas('inertia.flash_data.toast', fn ($toast) => $toast['type'] === 'success');

        Http::assertNothingSent();
    });

    test('another shop\'s payment can\'t be opened', function () {
        $payment = pendingPayment(Business::factory()->create());
        Http::fake();

        $this->actingAs($this->owner)->get(route('plan.payments.show', $payment))->assertNotFound();
        Http::assertNothingSent();
    });
});

describe('when the plan ends after paying', function () {
    test('renewing the same plan adds the months after the current end', function () {
        $this->business->forceFill(['plan' => Plan::Basic, 'plan_expires_at' => now()->addDays(5)])->save();

        expect(app(ActivatePlan::class)->endsAt($this->business, Plan::Basic, 3)->toDateString())->toBe('2027-01-20');
    });

    test('Pro during the trial starts when the trial ends; Basic starts now', function () {
        $this->business->forceFill(['trial_ends_at' => now()->addDays(10)])->save();

        expect(app(ActivatePlan::class)->endsAt($this->business, Plan::Pro, 1)->toDateString())->toBe('2026-11-25')
            ->and(app(ActivatePlan::class)->endsAt($this->business, Plan::Basic, 1)->toDateString())->toBe('2026-11-15');
    });

    test('upgrading turns the cheaper plan\'s unused days into days of the new one', function () {
        // 30 days of Basic left are worth 30 × 299 / 799 ≈ 11.2 days of Pro.
        $this->business->forceFill(['plan' => Plan::Basic, 'plan_expires_at' => now()->addDays(30)])->save();

        $endsAt = app(ActivatePlan::class)->endsAt($this->business, Plan::Pro, 1);

        expect($endsAt->toDateString())->toBe(now()->addSeconds((int) floor(30 * 86400 * 299 / 799))->addMonth()->toDateString())
            ->and($endsAt->toDateString())->toBe('2026-11-26');
    });
});

describe('Plan & billing', function () {
    test('offers each plan and length with its price and end date', function () {
        $this->actingAs($this->owner)->get(route('plan.show'))->assertInertia(fn (Assert $page) => $page
            ->where('online', true)
            ->has('options', 8)
            ->where('options.1', ['plan' => 'basic', 'months' => 3, 'amount' => 897, 'ends_at' => now()->addMonths(3)->toIso8601String(), 'refusal' => null])
            ->where('options.7.amount', 799 * 12)
            ->where('pending', null)
            ->where('history', []));
    });

    test('shows a payment left unfinished, for a day', function () {
        $payment = pendingPayment($this->business);

        $this->actingAs($this->owner)->get(route('plan.show'))->assertInertia(fn (Assert $page) => $page
            ->where('pending.amount', '897.00')
            ->where('pending.checkout_url', CHECKOUT_URL)
            ->where('pending.check_url', route('plan.payments.show', $payment)));

        $this->travel(25)->hours();
        $this->actingAs($this->owner)->get(route('plan.show'))->assertInertia(fn (Assert $page) => $page->where('pending', null));
    });

    test('lists paid payments', function () {
        $payment = pendingPayment($this->business);
        hitPayWebhook($this, hitPayRecord($payment));

        $this->actingAs($this->owner)->get(route('plan.show'))->assertInertia(fn (Assert $page) => $page
            ->has('history', 1)
            ->where('history.0.plan', 'Basic')
            ->where('history.0.months', 3)
            ->where('history.0.amount', '897.00'));
    });

    test('the banner says "Pay now" when the trial or plan is ending', function () {
        $this->business->forceFill(['trial_ends_at' => now()->addDays(2)])->save();

        $this->actingAs($this->owner)->get(route('dashboard'))
            ->assertInertia(fn (Assert $page) => $page->where('planNotice.action', 'pay'));
    });

    test('the pricing pages say how to pay', function () {
        $this->get(route('pricing'))->assertInertia(fn (Assert $page) => $page
            ->where('online', true)
            ->where('months', [1, 3, 6, 12]));
    });
});
