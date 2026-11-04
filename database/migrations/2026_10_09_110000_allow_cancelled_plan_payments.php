<?php

use App\Enums\PaymentStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Unfinished payments are cancelled at HitPay when the owner chooses
     * something else, so the status column also allows "cancelled".
     */
    public function up(): void
    {
        $this->allow(array_column(PaymentStatus::cases(), 'value'));
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('plan_payments')->where('status', 'cancelled')->update(['status' => 'failed']);
        $this->allow(['pending', 'paid', 'failed']);
    }

    /**
     * Laravel's enum() on Postgres is a varchar with this check constraint.
     *
     * @param  list<string>  $statuses
     */
    private function allow(array $statuses): void
    {
        $list = implode(', ', array_map(fn (string $status) => DB::getPdo()->quote($status), $statuses));

        DB::statement('alter table plan_payments drop constraint if exists plan_payments_status_check');
        DB::statement("alter table plan_payments add constraint plan_payments_status_check check (status::text in ({$list}))");
    }
};
