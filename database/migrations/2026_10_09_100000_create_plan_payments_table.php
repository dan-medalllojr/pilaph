<?php

use App\Enums\PaymentStatus;
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
        // One row per payment an owner starts for a plan (QR Ph via HitPay).
        Schema::create('plan_payments', function (Blueprint $table) {
            // Random UUID; also HitPay's reference_number for the payment.
            $table->uuid('id')->primary();
            $table->foreignId('business_id')->constrained()->cascadeOnDelete();
            // The owner who paid.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('plan', 16);
            $table->unsignedTinyInteger('months');
            // Pesos, e.g. 897.00.
            $table->decimal('amount', 10, 2);
            $table->string('currency', 3)->default('PHP');
            $table->enum('status', array_column(PaymentStatus::cases(), 'value'))
                ->default(PaymentStatus::Pending->value);
            $table->string('hitpay_request_id')->nullable()->unique();
            $table->string('hitpay_payment_id')->nullable();
            // HitPay's checkout page, to finish a payment the owner left.
            $table->text('checkout_url')->nullable();
            // When the plan ends after this payment, set when it's paid.
            $table->timestamp('plan_ends_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['business_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('plan_payments');
    }
};
