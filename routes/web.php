<?php

use App\Http\Controllers\Auth\GoogleController;
use App\Http\Controllers\Customer\DisplayController;
use App\Http\Controllers\Customer\JoinController;
use App\Http\Controllers\Customer\QueueStateController;
use App\Http\Controllers\Customer\TicketController;
use App\Http\Controllers\DemoController;
use App\Http\Controllers\HitPayWebhookController;
use App\Http\Controllers\Owner\BusinessSettingsController;
use App\Http\Controllers\Owner\BusinessSetupController;
use App\Http\Controllers\Owner\CounterController;
use App\Http\Controllers\Owner\DashboardController;
use App\Http\Controllers\Owner\DisplaySettingsController;
use App\Http\Controllers\Owner\PlanController;
use App\Http\Controllers\Owner\PlanPaymentController;
use App\Http\Controllers\Owner\PushSubscriptionController;
use App\Http\Controllers\Owner\QrPosterController;
use App\Http\Controllers\Owner\QueueController;
use App\Http\Controllers\Owner\ServiceController;
use App\Http\Controllers\Owner\ShopPhotoController;
use App\Http\Controllers\Owner\StatsController;
use App\Http\Controllers\PricingController;
use App\Http\Middleware\EnsureUserHasBusiness;
use Illuminate\Support\Facades\Route;

Route::get('/', [PricingController::class, 'home'])->name('home');
Route::get('pricing', [PricingController::class, 'show'])->name('pricing');

// HitPay: a plan payment went through (signed; no CSRF token, see bootstrap/app.php).
Route::post('webhooks/hitpay', HitPayWebhookController::class)
    ->middleware('throttle:60,1')
    ->name('webhooks.hitpay');

// "Try the demo" (DEMO_ENABLED): sign in as the sample shop's owner.
Route::post('demo', [DemoController::class, 'store'])
    ->middleware(['guest', 'throttle:10,1'])
    ->name('demo.store');
Route::post('demo/leave', [DemoController::class, 'destroy'])
    ->middleware('auth')
    ->name('demo.destroy');

// "Continue with Google" for owners. Email and password sign-in is Fortify's.
Route::middleware('throttle:10,1')->group(function () {
    Route::get('auth/google', [GoogleController::class, 'redirect'])->name('google.redirect');
    Route::get('auth/google/callback', [GoogleController::class, 'callback'])->name('google.callback');
});

// Customer pages (no login). The ticket's UUID link is the customer's identity.
Route::get('q/{business:slug}', [JoinController::class, 'show'])
    ->middleware('throttle:public-pages')
    ->name('queue.join');
Route::post('q/{business:slug}/tickets', [JoinController::class, 'store'])
    ->middleware('throttle:join')
    ->name('queue.tickets.store');
Route::get('q/{business:slug}/state', QueueStateController::class)
    ->middleware('throttle:public-pages')
    ->name('queue.state');

// TV display at the shop. The short token is the link's secret (it shows the QR code).
Route::where(['token' => '[a-z0-9]{12}'])->middleware('throttle:public-pages')->group(function () {
    Route::get('tv/{token}', [DisplayController::class, 'show'])->name('display.show');
    Route::get('tv/{token}/state', [DisplayController::class, 'state'])->name('display.state');
});

Route::whereUuid('ticket')->group(function () {
    Route::middleware('throttle:public-pages')->group(function () {
        Route::get('t/{ticket}', [TicketController::class, 'show'])->name('tickets.show');
        Route::get('t/{ticket}/state', [TicketController::class, 'state'])->name('tickets.state');
    });
    Route::post('t/{ticket}/cancel', [TicketController::class, 'cancel'])
        ->middleware('throttle:20,1')
        ->name('tickets.cancel');
});

Route::middleware(['auth', 'verified', 'throttle:owner-changes'])->group(function () {
    // First run after sign-up: name the shop.
    Route::get('dashboard/setup', [BusinessSetupController::class, 'create'])->name('business.setup');
    Route::post('dashboard/setup', [BusinessSetupController::class, 'store'])->name('business.store');

    // Owner pages, always scoped to the signed-in owner's business.
    Route::middleware(EnsureUserHasBusiness::class)->prefix('dashboard')->group(function () {
        Route::get('/', DashboardController::class)->name('dashboard');

        // Running today's queue.
        Route::get('state', [QueueController::class, 'state'])->name('dashboard.state');
        Route::post('counters/{counter}/call-next', [QueueController::class, 'callNext'])->name('dashboard.call-next');
        Route::post('tickets/bulk-remove', [QueueController::class, 'bulkRemove'])->name('dashboard.tickets.bulk-remove');
        Route::whereUuid('ticket')->group(function () {
            Route::post('tickets/{ticket}/done', [QueueController::class, 'done'])->name('dashboard.tickets.done');
            Route::post('tickets/{ticket}/no-show', [QueueController::class, 'noShow'])->name('dashboard.tickets.no-show');
            Route::post('tickets/{ticket}/recall', [QueueController::class, 'recall'])->name('dashboard.tickets.recall');
        });
        Route::post('queue/toggle', [QueueController::class, 'toggle'])->name('dashboard.queue.toggle');

        // Push alerts on the owner's devices.
        Route::post('push-subscriptions', [PushSubscriptionController::class, 'store'])->name('push-subscriptions.store');
        Route::delete('push-subscriptions', [PushSubscriptionController::class, 'destroy'])->name('push-subscriptions.destroy');
        Route::post('push-subscriptions/test', [PushSubscriptionController::class, 'test'])
            ->middleware('throttle:5,1')
            ->name('push-subscriptions.test');

        Route::get('stats', [StatsController::class, 'show'])->name('stats.show');
        Route::get('plan', [PlanController::class, 'show'])->name('plan.show');
        Route::post('plan/payments', [PlanPaymentController::class, 'store'])
            ->middleware('throttle:10,1')
            ->name('plan.payments.store');
        Route::get('plan/payments/{payment}', [PlanPaymentController::class, 'show'])
            ->whereUuid('payment')
            ->name('plan.payments.show');
        Route::get('qr', [QrPosterController::class, 'show'])->name('qr.show');
        Route::get('display', [DisplaySettingsController::class, 'edit'])->name('display.edit');
        Route::post('display/reset', [DisplaySettingsController::class, 'reset'])->name('display.reset');

        Route::get('business', [BusinessSettingsController::class, 'edit'])->name('business.edit');
        Route::put('business', [BusinessSettingsController::class, 'update'])->name('business.update');
        Route::post('business/photo', [ShopPhotoController::class, 'store'])
            ->middleware('throttle:10,1')
            ->name('business.photo.store');
        Route::delete('business/photo', [ShopPhotoController::class, 'destroy'])->name('business.photo.destroy');

        Route::resource('services', ServiceController::class)->only(['index', 'store', 'update', 'destroy']);
        Route::resource('counters', CounterController::class)->only(['index', 'store', 'update', 'destroy']);
    });
});

require __DIR__.'/settings.php';
