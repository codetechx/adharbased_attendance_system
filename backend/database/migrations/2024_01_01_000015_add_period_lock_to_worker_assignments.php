<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Columns may already exist — add only what's missing
        Schema::table('worker_assignments', function (Blueprint $table) {
            if (!Schema::hasColumn('worker_assignments', 'start_date')) {
                $table->date('start_date')->nullable()->after('vendor_id');
            }
            if (!Schema::hasColumn('worker_assignments', 'end_date')) {
                $table->date('end_date')->nullable()->after('start_date');
            }
            if (!Schema::hasColumn('worker_assignments', 'is_locked')) {
                $table->boolean('is_locked')->default(false)->after('status');
            }
        });

        // Back-fill from assignment_date if that column still exists
        if (Schema::hasColumn('worker_assignments', 'assignment_date')) {
            DB::statement('UPDATE worker_assignments SET start_date = assignment_date, end_date = assignment_date WHERE assignment_date IS NOT NULL AND start_date IS NULL');
        }

        // Ensure NOT NULL (safe to re-run)
        DB::statement('ALTER TABLE worker_assignments MODIFY start_date DATE NOT NULL');
        DB::statement('ALTER TABLE worker_assignments MODIFY end_date DATE NOT NULL');

        // Create new indexes FIRST so the company_id FK remains satisfied
        $hasNew1 = DB::select("SHOW INDEX FROM worker_assignments WHERE Key_name = 'wa_company_period_status'");
        if (empty($hasNew1)) {
            Schema::table('worker_assignments', function (Blueprint $table) {
                $table->index(['company_id', 'start_date', 'end_date', 'status'], 'wa_company_period_status');
            });
        }

        $hasNew2 = DB::select("SHOW INDEX FROM worker_assignments WHERE Key_name = 'wa_worker_period'");
        if (empty($hasNew2)) {
            Schema::table('worker_assignments', function (Blueprint $table) {
                $table->index(['worker_id', 'start_date', 'end_date'], 'wa_worker_period');
            });
        }

        // Drop old indexes (safe now — new company_id index exists above)
        $old1 = DB::select("SHOW INDEX FROM worker_assignments WHERE Key_name = 'worker_assignments_company_id_assignment_date_status_index'");
        if (!empty($old1)) {
            Schema::table('worker_assignments', function (Blueprint $table) {
                $table->dropIndex('worker_assignments_company_id_assignment_date_status_index');
            });
        }

        $old2 = DB::select("SHOW INDEX FROM worker_assignments WHERE Key_name = 'worker_assignments_worker_id_assignment_date_index'");
        if (!empty($old2)) {
            Schema::table('worker_assignments', function (Blueprint $table) {
                $table->dropIndex('worker_assignments_worker_id_assignment_date_index');
            });
        }

        // Drop legacy column
        if (Schema::hasColumn('worker_assignments', 'assignment_date')) {
            Schema::table('worker_assignments', function (Blueprint $table) {
                $table->dropColumn('assignment_date');
            });
        }
    }

    public function down(): void
    {
        Schema::table('worker_assignments', function (Blueprint $table) {
            $table->dropIndex('wa_company_period_status');
            $table->dropIndex('wa_worker_period');
            $table->date('assignment_date')->nullable()->after('vendor_id');
            $table->dropColumn(['start_date', 'end_date', 'is_locked']);
        });

        DB::statement('UPDATE worker_assignments SET assignment_date = NOW()');
        DB::statement('ALTER TABLE worker_assignments MODIFY assignment_date DATE NOT NULL');

        Schema::table('worker_assignments', function (Blueprint $table) {
            $table->index(['company_id', 'assignment_date', 'status']);
            $table->index(['worker_id', 'assignment_date']);
        });
    }
};
