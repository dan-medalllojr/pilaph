<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Close out each shop's day soon after its midnight (shops may be in
// different timezones; the command only touches days that have ended).
Schedule::command('queue:end-day')->hourly()->withoutOverlapping();

// The public demo's sample shop starts fresh every hour (when DEMO_ENABLED).
Schedule::command('demo:reset')->hourly()->withoutOverlapping();

// Alert owners 30 minutes before their join cutoff (once a day each).
Schedule::command('queue:cutoff-reminders')->everyMinute()->withoutOverlapping();

// Erase week-old customer names and phone numbers, and delete history older
// than each shop's plan keeps (config/plans.php). Quiet hours.
Schedule::command('data:prune')->dailyAt('03:15')->withoutOverlapping();

// Housekeeping: failed jobs after a week, expired password reset links.
Schedule::command('queue:prune-failed --hours=168')->dailyAt('03:30');
Schedule::command('auth:clear-resets')->dailyAt('03:30');
