<?php

namespace App\Http\Controllers;

use App\Models\AttendanceLog;
use App\Models\Company;
use App\Models\Vendor;
use App\Models\Worker;
use App\Models\WorkerAssignment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function stats(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->isSuperAdmin()) {
            return response()->json([
                'companies'          => Company::count(),
                'vendors'            => Vendor::count(),
                'workers'            => Worker::count(),
                'active_workers'     => Worker::where('status', 'active')->count(),
                'pending_workers'    => Worker::where('status', 'pending')->count(),
                'today_assignments'  => WorkerAssignment::forToday()->count(),
                'today_in'           => AttendanceLog::today()->where('type', 'IN')->where('is_valid', true)->count(),
                'today_out'          => AttendanceLog::today()->where('type', 'OUT')->where('is_valid', true)->count(),
                'pending_vendor_approvals' => \DB::table('company_vendors')->where('status', 'pending')->count(),
            ]);
        }

        if ($user->isCompanyUser()) {
            $cid = $user->company_id;
            return response()->json([
                'approved_vendors'   => Company::findOrFail($cid)->approvedVendors()->count(),
                'today_assignments'  => WorkerAssignment::forToday()->forCompany($cid)->count(),
                'today_in'           => AttendanceLog::today()->forCompany($cid)->where('type', 'IN')->where('is_valid', true)->count(),
                'today_out'          => AttendanceLog::today()->forCompany($cid)->where('type', 'OUT')->where('is_valid', true)->count(),
                'pending_in'         => $this->missingOutCount($cid),
                'pending_approvals'  => \DB::table('company_vendors')->where('company_id', $cid)->where('status', 'pending')->count(),
            ]);
        }

        if ($user->isVendorUser()) {
            $vid = $user->vendor_id;
            return response()->json([
                'total_workers'     => Worker::where('vendor_id', $vid)->count(),
                'active_workers'    => Worker::where('vendor_id', $vid)->where('status', 'active')->count(),
                'pending_workers'   => Worker::where('vendor_id', $vid)->where('status', 'pending')->count(),
                'approved_companies' => Vendor::findOrFail($vid)->approvedCompanies()->count(),
                'today_assignments' => WorkerAssignment::forToday()->forVendor($vid)->count(),
                'today_present'     => AttendanceLog::today()
                    ->where('is_valid', true)
                    ->where('type', 'IN')
                    ->whereHas('worker', fn($q) => $q->where('vendor_id', $vid))
                    ->count(),
            ]);
        }

        return response()->json([]);
    }

    public function todayAttendance(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = AttendanceLog::with(['worker:id,name', 'markedBy:id,name'])
            ->today()
            ->where('is_valid', true)
            ->when($user->isCompanyUser(), fn($q) => $q->where('company_id', $user->company_id))
            ->when($user->isVendorUser(), fn($q) => $q->whereHas('worker', fn($wq) => $wq->where('vendor_id', $user->vendor_id)))
            ->orderByDesc('marked_at')
            ->limit(50);

        return response()->json($query->get());
    }

    public function recentActivity(Request $request): JsonResponse
    {
        $user = $request->user();

        $logs = \App\Models\AuditLog::with('user:id,name')
            ->when(! $user->isSuperAdmin(), fn($q) => $q->where('user_id', $user->id))
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        return response()->json($logs);
    }

    private function missingOutCount(int $companyId): int
    {
        return AttendanceLog::where('type', 'IN')
            ->where('company_id', $companyId)
            ->where('is_valid', true)
            ->whereDate('marked_at', today())
            ->whereNotExists(function ($query) use ($companyId) {
                $query->from('attendance_logs as out')
                    ->whereColumn('out.worker_id', 'attendance_logs.worker_id')
                    ->where('out.company_id', $companyId)
                    ->where('out.type', 'OUT')
                    ->where('out.is_valid', true)
                    ->whereDate('out.marked_at', today());
            })
            ->count();
    }
}
