<?php

use App\Http\Controllers\Auth\GoogleController;
use App\Http\Controllers\Customer\JoinController;
use App\Http\Controllers\Customer\QueueStateController;
use App\Http\Controllers\Customer\TicketController;
use App\Http\Controllers\Owner\BusinessSettingsController;
use App\Http\Controllers\Owner\BusinessSetupController;
use App\Http\Controllers\Owner\CounterController;
use App\Http\Controllers\Owner\DashboardController;
use App\Http\Controllers\Owner\QueueController;
use App\Http\Controllers\Owner\ServiceController;
use App\Http\Middleware\EnsureUserHasBusiness;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

// "Continue with Google" for owners. Email and password sign-in is Fortify's.
Route::middleware('throttle:10,1')->group(function () {
    Route::get('auth/google', [GoogleController::class, 'redirect'])->name('google.redirect');
    Route::get('auth/google/callback', [GoogleController::class, 'callback'])->name('google.callback');
});

// Customer pages (no login). The ticket's UUID link is the customer's identity.
Route::get('q/{business:slug}', [JoinController::class, 'show'])->name('queue.join');
Route::post('q/{business:slug}/tickets', [JoinController::class, 'store'])
    ->middleware('throttle:join')
    ->name('queue.tickets.store');
Route::get('q/{business:slug}/state', QueueStateController::class)->name('queue.state');

Route::whereUuid('ticket')->group(function () {
    Route::get('t/{ticket}', [TicketController::class, 'show'])->name('tickets.show');
    Route::get('t/{ticket}/state', [TicketController::class, 'state'])->name('tickets.state');
    Route::post('t/{ticket}/cancel', [TicketController::class, 'cancel'])
        ->middleware('throttle:20,1')
        ->name('tickets.cancel');
});

Route::middleware(['auth', 'verified'])->group(function () {
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

        Route::get('business', [BusinessSettingsController::class, 'edit'])->name('business.edit');
        Route::put('business', [BusinessSettingsController::class, 'update'])->name('business.update');

        Route::resource('services', ServiceController::class)->only(['index', 'store', 'update', 'destroy']);
        Route::resource('counters', CounterController::class)->only(['index', 'store', 'update', 'destroy']);
    });
});

require __DIR__.'/settings.php';
