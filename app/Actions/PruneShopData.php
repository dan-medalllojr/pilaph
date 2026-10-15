<?php

namespace App\Actions;

use App\Models\Business;
use App\Models\SmsLog;
use App\Models\Ticket;
use Illuminate\Database\Eloquent\Builder;

/**
 * Keeps a shop's stored data small and its customers' personal data
 * short-lived (Plan.md, Phase 12):
 *
 * - a week after each queue day, customer names and phone numbers are
 *   erased, and the texts sent to them (which hold both) are deleted;
 *   counts and times stay for the stats;
 * - tickets older than the shop's plan keeps are deleted.
 *
 * Only touches past days, so it is safe to run any time and as often as needed.
 */
class PruneShopData
{
    private const BATCH = 1000;

    /**
     * @return array{erased: int, deleted: int}
     */
    public function execute(Business $business): array
    {
        $today = $business->localNow()->startOfDay();
        $eraseBefore = $today->subDays((int) config('plans.erase_personal_data_after_days'))->toDateString();
        $deleteBefore = $today->subDays($business->historyDaysKept())->toDateString();

        /** @return Builder<Ticket> */
        $before = fn (string $date): Builder => Ticket::query()
            ->where('business_id', $business->id)
            ->where('queue_date', '<', $date);

        // First the history past the plan (its texts go with it). In batches,
        // so a shop's first clean-up never holds a long lock.
        $deleted = 0;
        do {
            $ids = $before($deleteBefore)->limit(self::BATCH)->pluck('id');
            $count = $ids->isEmpty() ? 0 : Ticket::query()->whereIn('id', $ids)->delete();
            $deleted += $count;
        } while ($count === self::BATCH);

        // Then personal data on what's left: the texts hold names and numbers too.
        SmsLog::query()->whereIn('ticket_id', $before($eraseBefore)->select('id'))->delete();

        // toBase(): erasing isn't a change to the ticket, so updated_at stays.
        $erased = $before($eraseBefore)
            ->where(fn (Builder $query) => $query->where('customer_name', '<>', '')->orWhereNotNull('phone'))
            ->toBase()
            ->update(['customer_name' => '', 'phone' => null]);

        return ['erased' => $erased, 'deleted' => $deleted];
    }
}
