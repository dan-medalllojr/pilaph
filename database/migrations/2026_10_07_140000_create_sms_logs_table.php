<?php

use App\Enums\SmsStatus;
use App\Enums\SmsType;
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
        // One row per attempt to text a customer.
        Schema::create('sms_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('ticket_id')->constrained()->cascadeOnDelete();
            $table->string('phone', 12);
            $table->enum('type', array_column(SmsType::cases(), 'value'));
            $table->string('message', 320);
            $table->enum('status', array_column(SmsStatus::cases(), 'value'));
            $table->string('provider_message_id')->nullable();
            // Semaphore's answer, or the error; never the API key.
            $table->text('provider_response')->nullable();
            $table->timestamps();

            $table->index(['ticket_id', 'type']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sms_logs');
    }
};
