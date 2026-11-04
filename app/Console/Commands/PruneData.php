<?php

namespace App\Console\Commands;

use App\Actions\PruneShopData;
use App\Models\Business;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

#[Signature('data:prune')]
#[Description('Erase week-old customer names and phone numbers, and delete history older than each plan keeps')]
class PruneData extends Command
{
    public function handle(PruneShopData $prune): int
    {
        $erased = 0;
        $deleted = 0;

        Business::query()->chunkById(100, function ($businesses) use ($prune, &$erased, &$deleted) {
            foreach ($businesses as $business) {
                $result = $prune->execute($business);
                $erased += $result['erased'];
                $deleted += $result['deleted'];
            }
        });

        $expired = $this->deleteExpiredCache();

        $this->components->info("Erased names and numbers from {$erased} tickets; deleted {$deleted} old tickets and {$expired} expired cache entries.");

        return self::SUCCESS;
    }

    /**
     * The database cache never removes expired entries on its own (the
     * join rate limiter leaves one per visitor).
     */
    private function deleteExpiredCache(): int
    {
        if (config('cache.default') !== 'database') {
            return 0;
        }

        $store = (array) config('cache.stores.database');
        $connection = DB::connection($store['connection'] ?? null);

        return $connection->table($store['table'] ?? 'cache')->where('expiration', '<', now()->getTimestamp())->delete()
            + $connection->table($store['lock_table'] ?? 'cache_locks')->where('expiration', '<', now()->getTimestamp())->delete();
    }
}
