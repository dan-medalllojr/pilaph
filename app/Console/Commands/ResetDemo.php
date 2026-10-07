<?php

namespace App\Console\Commands;

use App\Actions\ResetDemoShop;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('demo:reset {--force : Build the demo shop even when DEMO_ENABLED is off (local setup)}')]
#[Description('Rebuild the public demo shop from scratch')]
class ResetDemo extends Command
{
    public function handle(ResetDemoShop $reset): int
    {
        if (! config('demo.enabled') && ! $this->option('force')) {
            $this->components->info('The demo is off (DEMO_ENABLED=false); nothing to do.');

            return self::SUCCESS;
        }

        $owner = $reset->execute();
        $this->components->info("Demo shop ready: {$owner->business?->name}.");

        return self::SUCCESS;
    }
}
