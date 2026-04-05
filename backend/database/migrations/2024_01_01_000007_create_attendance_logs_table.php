<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('worker_id')->constrained()->cascadeOnDelete();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('assignment_id')->nullable()->constrained('worker_assignments')->nullOnDelete();
            $table->enum('type', ['IN', 'OUT']);
            $table->timestamp('marked_at');
            $table->foreignId('marked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('method', ['fingerprint', 'manual'])->default('fingerprint');
            $table->unsignedTinyInteger('fingerprint_score')->nullable();
            $table->text('override_reason')->nullable();
            $table->string('device_id', 50)->nullable();
            $table->string('gate', 30)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->boolean('is_valid')->default(true);
            $table->string('invalidation_reason')->nullable();
            $table->timestamps();

            $table->index(['worker_id', 'company_id', 'is_valid']);
            $table->index(['company_id', 'marked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_logs');
    }
};
