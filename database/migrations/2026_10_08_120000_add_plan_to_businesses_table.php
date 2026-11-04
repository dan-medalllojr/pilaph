<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('businesses', function (Blueprint $table) {
            // free, basic or pro (App\Enums\Plan). Set by `php artisan plan:set`.
            $table->string('plan', 16)->default('free')->after('timezone');
            // When a paid plan ends (null: it doesn't). After this the shop is on Free.
            $table->timestamp('plan_expires_at')->nullable()->after('plan');
            // New shops try the trial plan until this time (config/plans.php).
            $table->timestamp('trial_ends_at')->nullable()->after('plan_expires_at');
        });

        // Shops that signed up before plans existed get the same trial as new ones.
        DB::table('businesses')
            ->where('is_demo', false)
            ->update(['trial_ends_at' => now()->addDays((int) config('plans.trial.days', 14))]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('businesses', function (Blueprint $table) {
            $table->dropColumn(['plan', 'plan_expires_at', 'trial_ends_at']);
        });
    }
};
