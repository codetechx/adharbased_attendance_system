<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', [
                'super_admin', 'company_admin', 'company_gate',
                'vendor_admin', 'vendor_operator',
            ])->default('company_gate')->after('email');
            $table->foreignId('company_id')->nullable()->after('role')->constrained('companies')->nullOnDelete();
            $table->foreignId('vendor_id')->nullable()->after('company_id')->constrained('vendors')->nullOnDelete();
            $table->string('phone', 20)->nullable()->after('vendor_id');
            $table->boolean('is_active')->default(true)->after('phone');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['company_id']);
            $table->dropForeign(['vendor_id']);
            $table->dropColumn(['role', 'company_id', 'vendor_id', 'phone', 'is_active']);
        });
    }
};
