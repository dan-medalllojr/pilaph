<?php

namespace App\Providers;

use App\Support\PhilippinePhone;
use Carbon\CarbonImmutable;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
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
