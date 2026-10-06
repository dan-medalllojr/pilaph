<?php

use App\Enums\TicketStatus;
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
        Schema::create('tickets', function (Blueprint $table) {
            // Random UUID; the customer's ticket link is their only identity.
            $table->uuid('id')->primary();
            $table->foreignId('business_id')->constrained()->cascadeOnDelete();
            // A service or counter with ticket history can't be deleted, only
            // switched off, so stats stay intact. NO ACTION (not RESTRICT) checks
            // at the end of the statement, so deleting a whole business still
            // cascades cleanly through its tickets and services.
            $table->foreignId('service_id')->constrained()->noActionOnDelete();
            $table->foreignId('counter_id')->nullable()->constrained()->noActionOnDelete();
            // Day in the business timezone; numbering resets per day.
            $table->date('queue_date');
            $table->unsignedInteger('number');
            // e.g. "A-024".
            $table->string('code', 16);
            $table->string('customer_name', 60);
            // Normalized to 639XXXXXXXXX.
            $table->string('phone', 12)->nullable();
            $table->enum('status', array_column(TicketStatus::cases(), 'value'))
                ->default(TicketStatus::Waiting->value);
            $table->timestamp('joined_at');
            $table->timestamp('called_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            // Set once each SMS is sent, so retries never send it twice.
            $table->timestamp('near_sms_sent_at')->nullable();
            $table->timestamp('called_sms_sent_at')->nullable();
            // Generated once by the join form; a resubmit returns the same ticket.
            $table->uuid('idempotency_key')->unique();
            // Random ID from a long-lived browser cookie.
            $table->string('device_id', 64);
            $table->timestamps();

            // Safety net against duplicate numbers.
            $table->unique(['service_id', 'queue_date', 'number']);
            // One active ticket per device / phone per business per day.
            $table->index(['business_id', 'queue_date', 'device_id', 'status']);
            $table->index(['business_id', 'queue_date', 'phone', 'status']);
            // Queue lookups (waiting list in join order).
            $table->index(['business_id', 'queue_date', 'status', 'joined_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tickets');
    }
};
