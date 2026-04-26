<?php

namespace App\Http\Controllers;

use App\Models\AttendanceLog;
use App\Models\Worker;
use App\Models\WorkerAssignment;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AttendanceController extends Controller
{
    public function __construct(private AuditService $audit) {}

    // ─── List attendance ──────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $user  = $request->user();
        $query = AttendanceLog::with(['worker:id,name,aadhaar_number_masked', 'markedBy:id,name'])
            ->when($user->isCompanyUser(), fn($q) => $q->where('company_id', $user->company_id))
            ->when($user->isVendorUser(), fn($q) =>
                $q->whereHas('worker', fn($wq) => $wq->where('vendor_id', $user->vendor_id))
            )
            ->when($request->date,      fn($q, $d) => $q->whereDate('marked_at', $d))
            ->when($request->worker_id, fn($q, $id) => $q->where('worker_id', $id))
            ->when($request->type,      fn($q, $t) => $q->where('type', strtoupper($t)))
            ->when($request->location,  fn($q, $l) => $q->where('location_name', $l))
            ->orderByDesc('marked_at');

        return response()->json($query->paginate(50));
    }

    // ─── Worker templates for frontend 1:N SGIBIOSRV matching ────────────────

    public function workerTemplates(Request $request): JsonResponse
    {
        $user      = $request->user();
        $companyId = $request->input('company_id') ?? $user->company_id;

        if (! $companyId) {
            return response()->json(['message' => 'company_id is required.'], 422);
        }

        if ($user->isCompanyUser() && $user->company_id !== (int) $companyId) {
            return response()->json(['message' => 'Unauthorized company.'], 403);
        }

        // Only workers with an active deployment covering today
        $activeWorkerIds = WorkerAssignment::where('company_id', $companyId)
            ->where('status', WorkerAssignment::STATUS_ACTIVE)
            ->where('start_date', '<=', today())
            ->where('end_date', '>=', today())
            ->pluck('worker_id');

        $workers = Worker::with('vendor')
            ->whereIn('id', $activeWorkerIds)
            ->whereNotNull('fingerprint_template')
            ->where('status', Worker::STATUS_ACTIVE)
            ->get();

        $result = $workers->map(function ($worker) use ($companyId) {
            $lastLog = AttendanceLog::where('worker_id', $worker->id)
                ->where('company_id', $companyId)
                ->where('location_name', AttendanceLog::DEFAULT_LOCATION_NAME)
                ->today()
                ->valid()
                ->orderByDesc('marked_at')
                ->first();

            $pendingType = ($lastLog?->type === AttendanceLog::TYPE_IN)
                ? AttendanceLog::TYPE_OUT
                : AttendanceLog::TYPE_IN;

            return [
                'worker_id'             => $worker->id,
                'name'                  => $worker->name,
                'photo_url'             => $worker->photo_url,
                'aadhaar_number_masked' => $worker->aadhaar_number_masked,
                'vendor'                => $worker->vendor?->name,
                'assignment_id'         => null,
                'pending_type'          => $pendingType,
                'template'              => decrypt($worker->fingerprint_template),
            ];
        });

        return response()->json($result);
    }

    // ─── Assigned workers list (for photo / manual attendance) ───────────────

    public function assignedWorkers(Request $request): JsonResponse
    {
        $user      = $request->user();
        $companyId = $request->input('company_id') ?? $user->company_id;

        if (! $companyId) {
            return response()->json(['message' => 'company_id is required.'], 422);
        }

        if ($user->isCompanyUser() && $user->company_id !== (int) $companyId) {
            return response()->json(['message' => 'Unauthorized company.'], 403);
        }

        $activeWorkerIds = WorkerAssignment::where('company_id', $companyId)
            ->where('status', WorkerAssignment::STATUS_ACTIVE)
            ->where('start_date', '<=', today())
            ->where('end_date', '>=', today())
            ->pluck('worker_id');

        $workers = Worker::with('vendor')
            ->whereIn('id', $activeWorkerIds)
            ->where('status', Worker::STATUS_ACTIVE)
            ->when($request->search, fn($q, $s) => $q->where('name', 'like', "%{$s}%"))
            ->orderBy('name')
            ->get();

        $result = $workers->map(function ($worker) use ($companyId) {
            $lastLog = AttendanceLog::where('worker_id', $worker->id)
                ->where('company_id', $companyId)
                ->where('location_name', AttendanceLog::DEFAULT_LOCATION_NAME)
                ->today()->valid()
                ->orderByDesc('marked_at')
                ->first();

            return [
                'worker_id'    => $worker->id,
                'name'         => $worker->name,
                'photo_url'    => $worker->photo_url,
                'vendor'       => $worker->vendor?->name,
                'pending_type' => ($lastLog?->type === 'IN') ? 'OUT' : 'IN',
            ];
        });

        return response()->json($result);
    }

    // ─── Mark attendance ──────────────────────────────────────────────────────

    public function mark(Request $request): JsonResponse
    {
        $data = $request->validate([
            'worker_id'         => 'required|integer|exists:workers,id',
            'company_id'        => 'required|integer|exists:companies,id',
            'assignment_id'     => 'nullable|integer|exists:worker_assignments,id',
            'type'              => 'required|in:IN,OUT',
            'method'            => 'required|in:fingerprint,photo,manual,id_card',
            'fingerprint_score' => 'nullable|integer|min:0|max:200',
            'override_reason'   => 'nullable|string',
            'gate'              => 'nullable|string',
            'device_id'         => 'nullable|string',
            'location_type'     => 'nullable|in:main_gate,department,checkpoint',
            'location_name'     => 'nullable|string|max:100',
            'parent_id'         => 'nullable|integer|exists:attendance_logs,id',
        ]);

        $user         = $request->user();
        $locationName = $data['location_name'] ?? AttendanceLog::DEFAULT_LOCATION_NAME;

        $error = $this->validateAttendanceMark($data['worker_id'], $data['company_id'], $data['type'], $locationName);
        if ($error) {
            return response()->json(['message' => $error], 422);
        }

        // Save proof photo if provided (multipart form upload)
        $authProofPath = null;
        if ($request->hasFile('photo')) {
            $request->validate(['photo' => 'image|max:5120|mimes:jpeg,png,jpg']);
            $authProofPath = $request->file('photo')
                ->store('attendance/photos/' . today()->format('Y/m/d'), 'private');
        }

        $log = AttendanceLog::create([
            'parent_id'         => $data['parent_id'] ?? null,
            'worker_id'         => $data['worker_id'],
            'company_id'        => $data['company_id'],
            'assignment_id'     => $data['assignment_id'] ?? null,
            'type'              => $data['type'],
            'marked_at'         => now(),
            'marked_by'         => $user->id,
            'method'            => $data['method'],
            'fingerprint_score' => $data['fingerprint_score'] ?? null,
            'auth_proof_path'   => $authProofPath,
            'override_reason'   => $data['override_reason'] ?? null,
            'gate'              => $data['gate'] ?? null,
            'device_id'         => $data['device_id'] ?? null,
            'location_type'     => $data['location_type'] ?? AttendanceLog::LOCATION_MAIN_GATE,
            'location_name'     => $locationName,
            'ip_address'        => $request->ip(),
            'is_valid'          => true,
        ]);

        $this->lockActiveDeployment($data['worker_id'], $data['company_id']);

        $this->audit->log($user->id, 'attendance_marked', AttendanceLog::class, $log->id, [
            'worker_id'     => $data['worker_id'],
            'type'          => $data['type'],
            'method'        => $data['method'],
            'location_name' => $locationName,
        ]);

        return response()->json([
            'message' => "Attendance {$data['type']} marked at {$locationName}.",
            'log'     => $log->load('worker:id,name'),
        ], 201);
    }

    // ─── Serve proof photo ────────────────────────────────────────────────────

    public function proofPhoto(Request $request, AttendanceLog $log)
    {
        abort_unless($log->auth_proof_path, 404);
        abort_unless(
            $request->user()->isSuperAdmin() || $request->user()->company_id === $log->company_id,
            403
        );

        return Storage::disk('private')->response($log->auth_proof_path);
    }

    // ─── Today's attendance ───────────────────────────────────────────────────

    public function today(Request $request): JsonResponse
    {
        $user  = $request->user();
        $query = AttendanceLog::with(['worker:id,name,photo_path', 'markedBy:id,name'])
            ->today()
            ->when($user->isCompanyUser(), fn($q) => $q->where('company_id', $user->company_id))
            ->orderByDesc('marked_at');

        return response()->json($query->get());
    }

    // ─── Worker history ───────────────────────────────────────────────────────

    public function workerHistory(Request $request, Worker $worker): JsonResponse
    {
        $logs = AttendanceLog::with(['company:id,name', 'markedBy:id,name'])
            ->where('worker_id', $worker->id)
            ->when($request->from, fn($q, $d) => $q->whereDate('marked_at', '>=', $d))
            ->when($request->to,   fn($q, $d) => $q->whereDate('marked_at', '<=', $d))
            ->orderByDesc('marked_at')
            ->paginate(30);

        return response()->json($logs);
    }

    // ─── Exceptions ───────────────────────────────────────────────────────────

    public function exceptions(Request $request): JsonResponse
    {
        $user = $request->user();
        $date = $request->date ?? today()->toDateString();

        $missingOut = AttendanceLog::select('worker_id', 'company_id', 'location_name')
            ->where('type', AttendanceLog::TYPE_IN)
            ->where('is_valid', true)
            ->whereDate('marked_at', $date)
            ->when($user->isCompanyUser(), fn($q) => $q->where('company_id', $user->company_id))
            ->whereNotExists(function ($query) use ($date) {
                $query->from('attendance_logs as out_log')
                    ->whereColumn('out_log.worker_id', 'attendance_logs.worker_id')
                    ->whereColumn('out_log.company_id', 'attendance_logs.company_id')
                    ->whereColumn('out_log.location_name', 'attendance_logs.location_name')
                    ->where('out_log.type', AttendanceLog::TYPE_OUT)
                    ->where('out_log.is_valid', true)
                    ->whereDate('out_log.marked_at', $date);
            })
            ->with(['worker:id,name', 'company:id,name'])
            ->get();

        return response()->json([
            'date'        => $date,
            'missing_out' => $missingOut,
            'total'       => $missingOut->count(),
        ]);
    }

    // ─── Report ───────────────────────────────────────────────────────────────

    public function report(Request $request): JsonResponse
    {
        $user = $request->user();

        $request->validate([
            'from'       => 'required|date',
            'to'         => 'required|date|after_or_equal:from',
            'company_id' => 'nullable|integer',
            'worker_id'  => 'nullable|integer',
        ]);

        $query = AttendanceLog::with(['worker:id,name', 'company:id,name'])
            ->whereDate('marked_at', '>=', $request->from)
            ->whereDate('marked_at', '<=', $request->to)
            ->where('is_valid', true)
            ->when($user->isCompanyUser(), fn($q) => $q->where('company_id', $user->company_id))
            ->when($request->company_id && $user->isSuperAdmin(), fn($q) => $q->where('company_id', $request->company_id))
            ->when($request->worker_id, fn($q) => $q->where('worker_id', $request->worker_id))
            ->orderBy('marked_at');

        return response()->json($query->paginate(100));
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private function validateAttendanceMark(int $workerId, int $companyId, string $type, string $locationName): ?string
    {
        $lastLog = AttendanceLog::where('worker_id', $workerId)
            ->where('company_id', $companyId)
            ->where('location_name', $locationName)
            ->today()
            ->valid()
            ->orderByDesc('marked_at')
            ->first();

        if ($type === AttendanceLog::TYPE_IN && $lastLog?->type === AttendanceLog::TYPE_IN) {
            return "Worker already marked IN at '{$locationName}'. Mark OUT first.";
        }

        if ($type === AttendanceLog::TYPE_OUT && (! $lastLog || $lastLog->type === AttendanceLog::TYPE_OUT)) {
            return "Cannot mark OUT at '{$locationName}' — no prior IN recorded today.";
        }

        return null;
    }

    private function lockActiveDeployment(int $workerId, int $companyId): void
    {
        WorkerAssignment::where('worker_id', $workerId)
            ->where('company_id', $companyId)
            ->where('status', WorkerAssignment::STATUS_ACTIVE)
            ->where('start_date', '<=', today())
            ->where('end_date', '>=', today())
            ->where('is_locked', false)
            ->update(['is_locked' => true]);
    }
}
