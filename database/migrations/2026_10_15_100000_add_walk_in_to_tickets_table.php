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
        Schema::table('tickets', function (Blueprint $table) {
            // Added by staff for a customer without a phone or internet:
            // no ticket page, so staff tell them their number.
            $table->boolean('walk_in')->default(false)->after('phone');
            // Walk-ins have no device.
            $table->string('device_id', 64)->nullable()->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('tickets')->whereNull('device_id')->update(['device_id' => 'walk-in']);

        Schema::table('tickets', function (Blueprint $table) {
            $table->string('device_id', 64)->nullable(false)->change();
            $table->dropColumn('walk_in');
        });
    }
};
