<?php

namespace App\Console\Commands;

use App\Models\Business;
use App\Services\OwnerAlerts;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('queue:cutoff-reminders')]
#[Description('Alert owners 30 minutes before their join cutoff')]
class SendCutoffReminders extends Command
{
    public function handle(OwnerAlerts $alerts): int
    {
        $sent = 0;

        Business::query()
            ->where('is_open', true)
            ->whereNotNull('join_cutoff_time')
            ->chunkById(100, function ($businesses) use ($alerts, &$sent) {
                foreach ($businesses as $business) {
                    $sent += (int) $alerts->remindCutoff($business);
                }
            });

        $this->components->info("Sent {$sent} cutoff reminders.");

        return self::SUCCESS;
    }
}
