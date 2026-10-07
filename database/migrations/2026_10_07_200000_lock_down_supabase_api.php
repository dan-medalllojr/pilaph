<?php

use App\Support\SupabaseApiLockdown;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * On Supabase: row level security on every table and no access for the
     * REST API's roles (see SupabaseApiLockdown). Does nothing elsewhere.
     */
    public function up(): void
    {
        SupabaseApiLockdown::apply(DB::connection());
    }

    /**
     * Not reversible on purpose: re-opening the tables to the public API
     * would expose user and customer data.
     */
    public function down(): void
    {
        //
    }
};
