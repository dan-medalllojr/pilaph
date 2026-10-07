<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Http;
use Laravel\Fortify\Features;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Tests never reach real services (Supabase, Semaphore, ...);
        // a test that needs one fakes it with Http::fake().
        Http::preventStrayRequests();

        // Pages render in the browser in tests, even while `composer run dev`
        // has Vite running (Inertia would otherwise ask it to render them).
        config(['inertia.ssr.enabled' => false]);
    }

    protected function skipUnlessFortifyHas(string $feature, ?string $message = null): void
    {
        if (! Features::enabled($feature)) {
            $this->markTestSkipped($message ?? "Fortify feature [{$feature}] is not enabled.");
        }
    }
}
