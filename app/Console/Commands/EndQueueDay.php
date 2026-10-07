<?php

namespace App\Console\Commands;

use App\Actions\RunEndOfDayCleanup;
use App\Models\Business;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('queue:end-day')]
#[Description("Close out past days' leftover tickets and change daily QR codes")]
class EndQueueDay extends Command
{
    public function handle(RunEndOfDayCleanup $cleanup): int
    {
        $closed = 0;
        $rotated = 0;

        Business::query()->chunkById(100, function ($businesses) use ($cleanup, &$closed, &$rotated) {
            foreach ($businesses as $business) {
                $result = $cleanup->execute($business);
                $closed += $result['closed'];
                $rotated += (int) $result['rotated'];
            }
        });

        $this->components->info("Closed {$closed} leftover tickets; changed {$rotated} QR codes.");

        return self::SUCCESS;
    }
}
