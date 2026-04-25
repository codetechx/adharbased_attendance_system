<?php

namespace App\Http\Controllers;

use App\Models\AttendanceLog;
use App\Models\Worker;
use App\Models\WorkerAssignment;
use App\Services\AuditService;
use App\Services\BiometricService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AttendanceController extends Controller
{
    public function __construct(
        private BiometricService $biometric,
        private AuditService $audit,
    ) {}

    // ─── List attendance ──────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $user  = $request->user();
        $query = AttendanceLog::with(['worker:id,name,aadhaar_number_masked', 'markedBy:id,name'])
            ->when($user->isCompanyUser(), fn($q) => $q->where('company_id', $user->company_id))
            ->when($user->isVendorUser(), function ($q) use ($user) {
                $q->whereHas('worker', fn($wq) => $wq->where('vendor_id', $user->vendor_id));
            })
            ->when($request->date, fn($q, $d) => $q->whereDate('marked_at', $d))
            ->when($request->worker_id, fn($q, $id) => $q->where('worker_id', $id))
            ->when($request->type, fn($q, $t) => $q->where('type', strtoupper($t)))
            ->orderByDesc('marked_at');

        return response()->json($query->paginate(50));
    }

    // ─── Verify fingerprint before marking ───────────────────────────────────

    public function verifyFingerprint(Request $request): JsonResponse
    {
        $data = $request->validate([
            'probe_template' => 'required|string', // live scan from gate device
            'company_id'     => 'required|integer|exists:companies,id',
        ]);

        $user = $request->user();

        if ($user->isCompanyUser() && $user->company_id !== (int)$data['company_id']) {
            return response()->json(['message' => 'Unauthorized company.'], 403);
        }

        // Get all workers assigned to this company today with fingerprints
        $assignments = WorkerAssignment::with('worker')
            ->forToday()
            ->forCompany($data['company_id'])
            ->whereHas('worker', fn($q) => $q->whereNotNull('fingerprint_template'))
            ->get();

        if ($assignments->isEmpty()) {
            return response()->json([
                'matched'  => false,
                'message'  => 'No workers assigned today or none have fingerprints enrolled.',
            ]);
        }

        $probeTemplate = $data['probe_template'];
        $matched       = null;
        $bestScore     = 0;

        // WBF mode: probe_template is a GUID returned by WinBioIdentify.
        // WBF matched internally; we just look up which worker owns that GUID.
        $isGuid = (bool) preg_match('/^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/i', $probeTemplate);

        if ($isGuid) {
            foreach ($assignments as $assignment) {
                $stored = $assignment->worker->fingerprint_template;
                if ($stored && decrypt($stored) === $probeTemplate) {
                    $matched   = ['assignment' => $assignment, 'score' => 100];
                    break;
                }
            }
        } else {
            foreach ($assignments as $assignment) {
                $storedTemplate = decrypt($assignment->worker->fingerprint_template);
                $result = $this->biometric->matchTemplates($probeTemplate, $storedTemplate);

                if ($result['matched'] && $result['score'] > $bestScore) {
                    $bestScore = $result['score'];
                    $matched   = ['assignment' => $assignment, 'score' => $result['score']];
                }
            }
        }

        if (! $matched) {
            $this->audit->log($user->id, 'fingerprint_verify_failed', null, null, [
                'company_id' => $data['company_id'],
                'ip'         => $request->ip(),
            ]);
            return response()->json(['matched' => false, 'message' => 'No fingerprint match found.']);
        }

        $worker     = $matched['assignment']->worker;
        $assignment = $matched['assignment'];

        // Determine what type of mark is pending
        $lastLog = AttendanceLog::where('worker_id', $worker->id)
            ->where('company_id', $data['company_id'])
            ->today()
            ->valid()
            ->orderByDesc('marked_at')
            ->first();

        $pendingType = ($lastLog?->type === AttendanceLog::TYPE_IN)
            ? AttendanceLog::TYPE_OUT
            : AttendanceLog::TYPE_IN;

        return response()->json([
            'matched'       => true,
            'score'         => $matched['score'],
            'worker'        => [
                'id'                   => $worker->id,
                'name'                 => $worker->name,
                'photo_url'            => $worker->photo_url,
                'aadhaar_number_masked' => $worker->aadhaar_number_masked,
                'vendor'               => $worker->vendor?->name,
            ],
            'assignment_id' => $assignment->id,
            'pending_type'  => $pendingType,
            'last_log'      => $lastLog ? [
                'type'      => $lastLog->type,
                'marked_at' => $lastLog->marked_at,
            ] : null,
        ]);
    }

    // ─── Worker templates for frontend 1:N matching (SGIBIOSRV) ─────────────────

    public function workerTemplates(Request $request): JsonResponse
    {
        $user = $request->user();

        $companyId = $request->input('company_id') ?? $user->company_id;

        if (!$companyId) {
            return response()->json(['message' => 'company_id is required.'], 422);
        }

        if ($user->isCompanyUser() && $user->company_id !== (int)$companyId) {
            return response()->json(['message' => 'Unauthorized company.'], 403);
        }

        // All active workers from vendors approved for this company
        $approvedVendorIds = \DB::table('company_vendors')
            ->where('company_id', $companyId)
            ->where('status', 'approved')
            ->pluck('vendor_id');

        $workers = Worker::with('vendor')
            ->whereIn('vendor_id', $approvedVendorIds)
            ->whereNotNull('fingerprint_template')
            ->where('status', Worker::STATUS_ACTIVE)
            ->get();

        $result = $workers->map(function ($worker) use ($companyId) {
            $lastLog = AttendanceLog::where('worker_id', $worker->id)
                ->where('company_id', $companyId)
                ->today()
                ->valid()
                ->orderByDesc('marked_at')
                ->first();

            $pendingType = ($lastLog?->type === AttendanceLog::TYPE_IN)
                ? AttendanceLog::TYPE_OUT
                : AttendanceLog::TYPE_IN;

            return [
                'worker_id'              => $worker->id,
                'name'                   => $worker->name,
                'photo_url'              => $worker->photo_url,
                'aadhaar_number_masked'  => $worker->aadhaar_number_masked,
                'vendor'                 => $worker->vendor?->name,
                'assignment_id'          => null,
                'pending_type'           => $pendingType,
                'template'               => decrypt($worker->fingerprint_template),
            ];
        });

        return response()->json($result);
    }

    // ─── Mark attendance (after fingerprint verification) ────────────────────

    public function mark(Request $request): JsonResponse
    {
        $data = $request->validate([
            'worker_id'          => 'required|integer|exists:workers,id',
            'company_id'         => 'required|integer|exists:companies,id',
            'assignment_id'      => 'nullable|integer|exists:worker_assignments,id',
            'type'               => 'required|in:IN,OUT',
            'fingerprint_score'  => 'required|integer|min:0|max:200',
            'gate'               => 'nullable|string',
            'device_id'          => 'nullable|string',
        ]);

        $user = $request->user();

        // Business rule validations
        $errors = $this->validateAttendanceMark(
            $data['worker_id'],
            $data['company_id'],
            $data['type']
        );

        if ($errors) {
            return response()->json(['message' => $errors], 422);
        }

        $log = AttendanceLog::create([
            'worker_id'         => $data['worker_id'],
            'company_id'        => $data['company_id'],
            'assignment_id'     => $data['assignment_id'] ?? null,
            'type'              => $data['type'],
            'marked_at'         => now(),
            'marked_by'         => $user->id,
            'method'            => AttendanceLog::METHOD_FINGERPRINT,
            'fingerprint_score' => $data['fingerprint_score'],
            'gate'              => $data['gate'] ?? null,
            'device_id'         => $data['device_id'] ?? null,
            'ip_address'        => $request->ip(),
            'is_valid'          => true,
        ]);

        $this->audit->log($user->id, 'attendance_marked', AttendanceLog::class, $log->id, [
            'worker_id' => $data['worker_id'],
            'type'      => $data['type'],
        ]);

        return response()->json([
            'message'   => "Attendance {$data['type']} marked successfully.",
            'log'       => $log->load('worker:id,name'),
        ], 201);
    }

    // ─── Manual override ──────────────────────────────────────────────────────

    public function manualMark(Request $request): JsonResponse
    {
        $data = $request->validate([
            'worker_id'      => 'required|integer|exists:workers,id',
            'company_id'     => 'required|integer|exists:companies,id',
            'type'           => 'required|in:IN,OUT',
            'marked_at'      => 'required|date',
            'override_reason' => 'required|string|min:10',
        ]);

        $user = $request->user();

        // Only admin roles can do manual marks
        if ($user->role === User::ROLE_COMPANY_GATE) {
            return response()->json(['message' => 'Gate users cannot manually override attendance.'], 403);
        }

        $assignment = WorkerAssignment::where('worker_id', $data['worker_id'])
            ->where('company_id', $data['company_id'])
            ->whereDate('assignment_date', Carbon::parse($data['marked_at'])->toDateString())
            ->first();

        $log = AttendanceLog::create([
            'worker_id'       => $data['worker_id'],
            'company_id'      => $data['company_id'],
            'assignment_id'   => $assignment?->id,
            'type'            => $data['type'],
            'marked_at'       => $data['marked_at'],
            'marked_by'       => $user->id,
            'method'          => AttendanceLog::METHOD_MANUAL,
            'override_reason' => $data['override_reason'],
            'ip_address'      => $request->ip(),
            'is_valid'        => true,
        ]);

        $this->audit->log($user->id, 'attendance_manual_override', AttendanceLog::class, $log->id, [
            'reason' => $data['override_reason'],
        ]);

        return response()->json(['message' => 'Manual attendance recorded.', 'log' => $log], 201);
    }

    // ─── Today's attendance ────────────────────────────────────────────────────

    public function today(Request $request): JsonResponse
    {
        $user  = $request->user();
        $query = AttendanceLog::with(['worker:id,name,photo_path', 'markedBy:id,name'])
            ->today()
            ->when($user->isCompanyUser(), fn($q) => $q->where('company_id', $user->company_id))
            ->orderByDesc('marked_at');

        return response()->json($query->get());
    }

    // ─── Worker history ────────────────────────────────────────────────────────

    public function workerHistory(Request $request, Worker $worker): JsonResponse
    {
        $logs = AttendanceLog::with(['company:id,name', 'markedBy:id,name'])
            ->where('worker_id', $worker->id)
            ->when($request->from, fn($q, $d) => $q->whereDate('marked_at', '>=', $d))
            ->when($request->to, fn($q, $d) => $q->whereDate('marked_at', '<=', $d))
            ->orderByDesc('marked_at')
            ->paginate(30);

        return response()->json($logs);
    }

    // ─── Exceptions report ────────────────────────────────────────────────────

    public function exceptions(Request $request): JsonResponse
    {
        $user = $request->user();
        $date = $request->date ?? today()->toDateString();

        // Workers with IN but no OUT today
        $missingOut = AttendanceLog::select('worker_id', 'company_id')
            ->where('type', AttendanceLog::TYPE_IN)
            ->where('is_valid', true)
            ->whereDate('marked_at', $date)
            ->when($user->isCompanyUser(), fn($q) => $q->where('company_id', $user->company_id))
            ->whereNotExists(function ($query) use ($date) {
                $query->from('attendance_logs as out_log')
                    ->whereColumn('out_log.worker_id', 'attendance_logs.worker_id')
                    ->whereColumn('out_log.company_id', 'attendance_logs.company_id')
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

    // ─── Report ────────────────────────────────────────────────────────────────

    public function report(Request $request): JsonResponse
    {
        $user = $request->user();

        $request->validate([
            'from'       => 'required|date',
            'to'         => 'required|date|after_or_equal:from',
            'company_id' => 'nullable|integer',
            'vendor_id'  => 'nullable|integer',
            'worker_id'  => 'nullable|integer',
        ]);

        $query = AttendanceLog::with(['worker:id,name', 'company:id,name'])
            ->whereDate('marked_at', '>=', $request->from)
            ->whereDate('marked_at', '<=', $request->to)
            ->where('is_valid', true)
            ->when($user->isCompanyUser(), fn($q) => $q->where('company_id', $user->company_id))
            ->when($request->company_id && $user->isSuperAdmin(), fn($q, $id) => $q->where('company_id', $request->company_id))
            ->when($request->worker_id, fn($q, $id) => $q->where('worker_id', $id))
            ->orderBy('marked_at');

        return response()->json($query->paginate(100));
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private function validateAttendanceMark(int $workerId, int $companyId, string $type): ?string
    {
        $lastLog = AttendanceLog::where('worker_id', $workerId)
            ->where('company_id', $companyId)
            ->today()
            ->valid()
            ->orderByDesc('marked_at')
            ->first();

        if ($type === AttendanceLog::TYPE_IN && $lastLog?->type === AttendanceLog::TYPE_IN) {
            return 'Worker has already marked IN today. Cannot mark IN again without OUT.';
        }

        if ($type === AttendanceLog::TYPE_OUT && (!$lastLog || $lastLog->type === AttendanceLog::TYPE_OUT)) {
            return 'Cannot mark OUT without a prior IN for today.';
        }

        return null;
    }
}
