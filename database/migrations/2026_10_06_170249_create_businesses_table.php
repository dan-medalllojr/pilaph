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
        Schema::create('businesses', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            // When false, new joins are rejected.
            $table->boolean('is_open')->default(true);
            // Queue position that gets the "almost your turn" SMS.
            $table->unsignedSmallInteger('near_threshold')->default(3);
            // New joins are rejected once this many are waiting (null = no limit).
            $table->unsignedInteger('max_waiting')->nullable();
            // Joins close after this time each day (null = no cutoff).
            $table->time('join_cutoff_time')->nullable();
            // Required in the join URL; rotated nightly when rotate_qr_daily is on.
            $table->string('qr_token', 64);
            $table->boolean('rotate_qr_daily')->default(false);
            $table->date('qr_token_date');
            $table->string('timezone')->default('Asia/Manila');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('businesses');
    }
};
