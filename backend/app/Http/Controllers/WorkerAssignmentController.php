<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Worker;
use App\Models\WorkerAssignment;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WorkerAssignmentController extends Controller
{
    public function __construct(private AuditService $audit) {}

    public function index(Request $request): JsonResponse
    {
        $user  = $request->user();
        $query = WorkerAssignment::with(['worker:id,name,status', 'company:id,name', 'vendor:id,name'])
            ->when($user->isCompanyUser(), fn($q) => $q->where('company_id', $user->company_id))
            ->when($user->isVendorUser(), fn($q) => $q->where('vendor_id', $user->vendor_id))
            ->when($request->date, fn($q, $d) => $q->whereDate('assignment_date', $d))
            ->when($request->status, fn($q, $s) => $q->where('status', $s))
            ->orderByDesc('assignment_date');

        return response()->json($query->paginate(30));
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'worker_id'       => 'required|integer|exists:workers,id',
            'company_id'      => 'required|integer|exists:companies,id',
            'assignment_date' => 'required|date|after_or_equal:today',
            'shift'           => 'nullable|string|in:morning,afternoon,night,general',
            'gate'            => 'nullable|string',
            'notes'           => 'nullable|string',
        ]);

        $worker  = Worker::findOrFail($data['worker_id']);
        $company = Company::findOrFail($data['company_id']);

        // Vendor user can only assign their own workers
        if ($user->isVendorUser() && $worker->vendor_id !== $user->vendor_id) {
            return response()->json(['message' => 'Cannot assign worker from another vendor.'], 403);
        }

        // Check vendor is approved for the target company
        $isApproved = $company->vendors()
            ->where('vendor_id', $worker->vendor_id)
            ->wherePivot('status', 'approved')
            ->exists();

        if (! $isApproved) {
            return response()->json([
                'message' => 'Your vendor is not approved for this company. Request approval first.',
            ], 422);
        }

        // Worker must be active (Aadhaar + fingerprint done)
        if ($worker->status !== Worker::STATUS_ACTIVE) {
            return response()->json([
                'message' => 'Worker enrollment is incomplete. Aadhaar and fingerprint must be registered first.',
            ], 422);
        }

        // Prevent duplicate active assignment for same date + company
        $duplicate = WorkerAssignment::where('worker_id', $data['worker_id'])
            ->where('company_id', $data['company_id'])
            ->whereDate('assignment_date', $data['assignment_date'])
            ->where('status', WorkerAssignment::STATUS_ACTIVE)
            ->exists();

        if ($duplicate) {
            return response()->json([
                'message' => 'Worker is already assigned to this company on this date.',
            ], 422);
        }

        $data['vendor_id']    = $worker->vendor_id;
        $data['assigned_by']  = $user->id;
        $data['status']       = WorkerAssignment::STATUS_ACTIVE;

        $assignment = WorkerAssignment::create($data);

        $this->audit->log($user->id, 'assignment_created', WorkerAssignment::class, $assignment->id, [
            'worker_id'  => $data['worker_id'],
            'company_id' => $data['company_id'],
            'date'       => $data['assignment_date'],
        ]);

        return response()->json($assignment->load(['worker', 'company', 'vendor']), 201);
    }

    public function show(WorkerAssignment $assignment): JsonResponse
    {
        return response()->json($assignment->load(['worker', 'company', 'vendor', 'attendanceLogs']));
    }

    public function update(Request $request, WorkerAssignment $assignment): JsonResponse
    {
        $data = $request->validate([
            'shift'  => 'nullable|string',
            'gate'   => 'nullable|string',
            'status' => 'nullable|in:active,cancelled',
            'notes'  => 'nullable|string',
        ]);

        $assignment->update($data);
        $this->audit->log($request->user()->id, 'assignment_updated', WorkerAssignment::class, $assignment->id);

        return response()->json($assignment->fresh());
    }

    public function destroy(Request $request, WorkerAssignment $assignment): JsonResponse
    {
        $assignment->update(['status' => WorkerAssignment::STATUS_CANCELLED]);
        $this->audit->log($request->user()->id, 'assignment_cancelled', WorkerAssignment::class, $assignment->id);

        return response()->json(['message' => 'Assignment cancelled.']);
    }

    public function todayForCompany(Request $request, Company $company): JsonResponse
    {
        $assignments = WorkerAssignment::with([
            'worker:id,name,photo_path,fingerprint_template,status',
            'vendor:id,name',
        ])
            ->forToday()
            ->forCompany($company->id)
            ->get()
            ->map(function ($a) {
                $a->worker->has_fingerprint = $a->worker->hasFingerprint();
                unset($a->worker->fingerprint_template); // never expose raw template
                return $a;
            });

        return response()->json($assignments);
    }

    public function forWorker(Request $request, Worker $worker): JsonResponse
    {
        $assignments = WorkerAssignment::with(['company:id,name'])
            ->where('worker_id', $worker->id)
            ->orderByDesc('assignment_date')
            ->paginate(20);

        return response()->json($assignments);
    }
}
