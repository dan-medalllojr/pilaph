<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('businesses', function (Blueprint $table) {
            // Shown at the top of the customer join page (ShopPhotos).
            $table->string('photo_path')->nullable()->after('display_token');
            // Where it is: "supabase" (Storage bucket) or "public" (local disk).
            $table->string('photo_disk', 16)->nullable()->after('photo_path');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('businesses', function (Blueprint $table) {
            $table->dropColumn(['photo_path', 'photo_disk']);
        });
    }
};
