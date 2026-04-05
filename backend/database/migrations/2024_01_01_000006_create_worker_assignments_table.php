<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('worker_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('worker_id')->constrained()->cascadeOnDelete();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->date('assignment_date');
            $table->enum('shift', ['morning', 'afternoon', 'night', 'general'])->default('general');
            $table->string('gate', 30)->nullable();
            $table->enum('status', ['active', 'cancelled', 'completed'])->default('active');
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'assignment_date', 'status']);
            $table->index(['worker_id', 'assignment_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('worker_assignments');
    }
};
