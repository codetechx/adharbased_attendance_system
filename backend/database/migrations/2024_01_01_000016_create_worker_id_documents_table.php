<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('worker_id_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('worker_id')->constrained()->cascadeOnDelete();
            $table->enum('id_type', ['aadhaar', 'pan', 'driving_licence', 'voter_id', 'passport', 'other']);
            $table->string('id_number_masked', 50)->nullable(); // last 4 or masked format
            $table->json('id_data_extracted')->nullable();       // parsed fields if auto-extracted
            $table->string('document_path', 500)->nullable();   // private disk path to scanned image
            $table->boolean('is_primary')->default(false);      // first ID used for registration
            $table->timestamps();

            $table->index(['worker_id', 'id_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('worker_id_documents');
    }
};
