<?php

namespace App\Providers;

use App\Support\PhilippinePhone;
use App\Support\SupabaseApiLockdown;
use Carbon\CarbonImmutable;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Events\MigrationsEnded;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
        $this->configureRateLimits();
        $this->lockDownSupabaseApiAfterMigrations();
    }

    /**
     * Tables added by later migrations get row level security and stay out
     * of Supabase's public REST API too (App\Support\SupabaseApiLockdown).
     */
    private function lockDownSupabaseApiAfterMigrations(): void
    {
        Event::listen(function (MigrationsEnded $event) {
            SupabaseApiLockdown::apply(DB::connection());
        });
    }

    /**
     * Spam protection for joining the queue (Plan.md, "Traffic and capacity
     * protection"). The per-IP limit is generous because a shop's customers
     * often share its Wi-Fi.
     */
    protected function configureRateLimits(): void
    {
        RateLimiter::for('join', function (Request $request): array {
            $limits = [Limit::perMinute(20)->by('join-ip:'.$request->ip())];

            $phone = PhilippinePhone::normalize($request->string('phone')->value());
            if ($phone !== null) {
                $limits[] = Limit::perHour(6)->by('join-phone:'.$phone);
            }

            return $limits;
        });

        // The public queue, ticket and TV pages and the live state they check.
        // A phone checks a few times a minute (more when the queue moves), and
        // a shop's phones often share one Wi-Fi address, so: 300 a minute per
        // address and page, and 1,200 a minute per address in all. Enough for a
        // busy shop; it stops one machine from hammering the server.
        RateLimiter::for('public-pages', fn (Request $request): array => [
            Limit::perMinute(300)->by('public:'.$request->ip().'|'.$request->path()),
            Limit::perMinute(1200)->by('public-ip:'.$request->ip()),
        ]);

        // Changes on owner pages: 60 a minute per account and address. Running
        // even a busy queue takes a few a minute; this stops a script from
        // flooding the database, e.g. with services in the shared demo. Per
        // address too, so one demo visitor can't use up the others' limit.
        RateLimiter::for('owner-changes', fn (Request $request): Limit => $request->isMethodSafe()
            ? Limit::none()
            : Limit::perMinute(60)->by('owner:'.($request->user()->id ?? 'guest').'|'.$request->ip()));
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
