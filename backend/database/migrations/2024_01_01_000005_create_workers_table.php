<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->date('dob')->nullable();
            $table->enum('gender', ['M', 'F', 'O'])->nullable();
            $table->text('address')->nullable();
            $table->string('city', 60)->nullable();
            $table->string('state', 60)->nullable();
            $table->string('pin', 6)->nullable();
            $table->string('phone', 20)->nullable();
            // Aadhaar — stored masked / encrypted
            $table->string('aadhaar_number_masked', 20)->nullable(); // e.g. XXXX-XXXX-1234
            $table->string('aadhaar_pdf_path')->nullable();          // private disk path
            $table->json('aadhaar_data_extracted')->nullable();       // parsed fields from PDF
            // Photo
            $table->string('photo_path')->nullable();
            // Fingerprint
            $table->text('fingerprint_template')->nullable();         // encrypted FMD
            $table->timestamp('fingerprint_enrolled_at')->nullable();
            $table->unsignedTinyInteger('fingerprint_quality')->nullable();
            // Status
            $table->enum('status', ['pending', 'active', 'inactive', 'blocked'])->default('pending');
            $table->text('notes')->nullable();
            $table->foreignId('registered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['vendor_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workers');
    }
};
