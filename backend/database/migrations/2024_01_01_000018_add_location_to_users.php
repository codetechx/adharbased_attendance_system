<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'location_type')) {
                $table->enum('location_type', ['main_gate', 'department', 'checkpoint'])
                      ->nullable()->after('phone');
            }
            if (!Schema::hasColumn('users', 'location_name')) {
                $table->string('location_name', 100)->nullable()->after('location_type');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['location_type', 'location_name']);
        });
    }
};
