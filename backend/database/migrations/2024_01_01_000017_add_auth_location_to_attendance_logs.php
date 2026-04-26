<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Expand method ENUM — include existing 'face' value to avoid data loss
        DB::statement("ALTER TABLE attendance_logs MODIFY method ENUM('fingerprint','photo','manual','id_card','face') NOT NULL DEFAULT 'fingerprint'");

        Schema::table('attendance_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('attendance_logs', 'auth_proof_path')) {
                $table->string('auth_proof_path', 500)->nullable()->after('method');
            }
            if (!Schema::hasColumn('attendance_logs', 'location_type')) {
                $table->enum('location_type', ['main_gate', 'department', 'checkpoint'])
                      ->default('main_gate')->after('gate');
            }
            if (!Schema::hasColumn('attendance_logs', 'location_name')) {
                $table->string('location_name', 100)->nullable()->after('location_type');
            }
            if (!Schema::hasColumn('attendance_logs', 'parent_id')) {
                $table->foreignId('parent_id')->nullable()
                      ->after('id')
                      ->constrained('attendance_logs')
                      ->nullOnDelete();
            }
        });

        $has = DB::select("SHOW INDEX FROM attendance_logs WHERE Key_name = 'al_worker_location'");
        if (empty($has)) {
            Schema::table('attendance_logs', function (Blueprint $table) {
                $table->index(['worker_id', 'company_id', 'location_name', 'is_valid'], 'al_worker_location');
            });
        }
    }

    public function down(): void
    {
        Schema::table('attendance_logs', function (Blueprint $table) {
            $table->dropIndex('al_worker_location');
            $table->dropForeign(['parent_id']);
            $table->dropColumn(['parent_id', 'auth_proof_path', 'location_type', 'location_name']);
        });

        DB::statement("ALTER TABLE attendance_logs MODIFY method ENUM('fingerprint','manual') NOT NULL DEFAULT 'fingerprint'");
    }
};
