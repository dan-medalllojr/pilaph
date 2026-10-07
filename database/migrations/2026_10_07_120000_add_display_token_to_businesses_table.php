<?php

use App\Models\Business;
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
            // The secret in the TV display link (/tv/{display_token}). Separate
            // from qr_token, which the display shows; the owner can reset it.
            $table->string('display_token', 32)->nullable()->unique()->after('qr_token_date');
        });

        foreach (DB::table('businesses')->whereNull('display_token')->pluck('id') as $id) {
            DB::table('businesses')->where('id', $id)->update(['display_token' => Business::generateDisplayToken()]);
        }

        Schema::table('businesses', function (Blueprint $table) {
            $table->string('display_token', 32)->nullable(false)->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('businesses', function (Blueprint $table) {
            $table->dropColumn('display_token');
        });
    }
};
