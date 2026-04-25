<?php

namespace App\Http\Controllers;

use App\Models\Worker;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class WorkerController extends Controller
{
    public function __construct(
        private AuditService $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Worker::with(['vendor:id,name'])
            ->when($user->isVendorUser(), fn($q) => $q->where('vendor_id', $user->vendor_id))
            ->when($user->isCompanyUser(), function ($q) use ($user) {
                $approvedVendorIds = \DB::table('company_vendors')
                    ->where('company_id', $user->company_id)
                    ->where('status', 'approved')
                    ->pluck('vendor_id');
                $q->whereIn('vendor_id', $approvedVendorIds);
            })
            ->when($request->status, fn($q, $s) => $q->where('status', $s))
            ->when($request->search, fn($q, $s) => $q->where('name', 'like', "%{$s}%"))
            ->orderByDesc('created_at');

        return response()->json($query->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'name'                   => 'required|string|max:120',
            'dob'                    => 'required|date|before:today',
            'gender'                 => 'required|in:M,F,O',
            'address'                => 'required|string',
            'city'                   => 'nullable|string|max:100',
            'state'                  => 'nullable|string|max:100',
            'pin'                    => 'nullable|string|size:6',
            'phone'                  => 'nullable|string|max:15',
            'mobile'                 => 'nullable|string|max:15',
            'aadhaar_number_masked'  => 'nullable|string',
            'aadhaar_data_extracted' => 'nullable|array',
            'notes'                  => 'nullable|string',
            'vendor_id'              => [
                Rule::requiredIf(! $user->isVendorUser()),
                'nullable',
                'integer',
                'exists:vendors,id',
            ],
        ]);

        // Vendor users can only register under their own vendor
        if ($user->isVendorUser()) {
            $data['vendor_id'] = $user->vendor_id;
        }

        // Guard: vendor_id must be resolved at this point
        if (empty($data['vendor_id'])) {
            return response()->json(['message' => 'vendor_id is required.'], 422);
        }

        $data['registered_by'] = $user->id;
        $data['status']        = Worker::STATUS_PENDING;

        $worker = Worker::create($data);

        $this->audit->log($user->id, 'worker_created', Worker::class, $worker->id, [
            'worker_name' => $worker->name,
        ]);

        return response()->json($worker->load('vendor'), 201);
    }

    public function show(Request $request, Worker $worker): JsonResponse
    {
        $this->authorizeWorkerAccess($request->user(), $worker);

        return response()->json($worker->load(['vendor', 'assignments.company']));
    }

    public function update(Request $request, Worker $worker): JsonResponse
    {
        $this->authorizeWorkerAccess($request->user(), $worker);

        $data = $request->validate([
            'name'    => 'sometimes|string|max:120',
            'dob'     => 'sometimes|date|before:today',
            'gender'  => 'sometimes|in:M,F,O',
            'address' => 'sometimes|string',
            'city'    => 'nullable|string',
            'state'   => 'nullable|string',
            'pin'     => 'nullable|string|size:6',
            'phone'   => 'nullable|string|max:15',
            'notes'   => 'nullable|string',
        ]);

        $worker->update($data);
        $this->audit->log($request->user()->id, 'worker_updated', Worker::class, $worker->id);

        return response()->json($worker->fresh());
    }

    public function destroy(Request $request, Worker $worker): JsonResponse
    {
        $this->authorizeWorkerAccess($request->user(), $worker);

        $worker->delete();
        $this->audit->log($request->user()->id, 'worker_deleted', Worker::class, $worker->id);

        return response()->json(['message' => 'Worker deleted.']);
    }

    // ─── Fingerprint Enrollment ───────────────────────────────────────────────

    public function storeFingerprint(Request $request, Worker $worker): JsonResponse
    {
        $this->authorizeWorkerAccess($request->user(), $worker);

        $data = $request->validate([
            'template' => 'required|string', // base64 FMD from local biometric agent
            'quality'  => 'required|integer|min:0|max:100',
        ]);

        $worker->update([
            'fingerprint_template'   => encrypt($data['template']), // store encrypted
            'fingerprint_quality'    => $data['quality'],
            'fingerprint_enrolled_at' => now(),
        ]);

        // If Aadhaar is also done, activate the worker
        if ($worker->aadhaar_number_masked) {
            $worker->update(['status' => Worker::STATUS_ACTIVE]);
        }

        $this->audit->log($request->user()->id, 'fingerprint_enrolled', Worker::class, $worker->id, [
            'quality' => $data['quality'],
        ]);

        return response()->json([
            'message'              => 'Fingerprint enrolled successfully.',
            'status'               => $worker->fresh()->status,
            'fingerprint_quality'  => $data['quality'],
            'fingerprint_enrolled_at' => now(),
        ]);
    }

    public function deleteFingerprint(Request $request, Worker $worker): JsonResponse
    {
        $this->authorizeWorkerAccess($request->user(), $worker);

        $worker->update([
            'fingerprint_template'    => null,
            'fingerprint_quality'     => null,
            'fingerprint_enrolled_at' => null,
            'status'                  => Worker::STATUS_PENDING,
        ]);

        $this->audit->log($request->user()->id, 'fingerprint_deleted', Worker::class, $worker->id);

        return response()->json(['message' => 'Fingerprint removed.']);
    }

    // ─── Photo Upload ─────────────────────────────────────────────────────────

    public function uploadPhoto(Request $request, Worker $worker): JsonResponse
    {
        $this->authorizeWorkerAccess($request->user(), $worker);

        $request->validate([
            'photo' => 'required|image|max:2048|mimes:jpeg,png,jpg',
        ]);

        if ($worker->photo_path) {
            Storage::disk('private')->delete($worker->photo_path);
        }

        $path = $request->file('photo')->store('workers/photos', 'private');
        $worker->update(['photo_path' => $path]);

        return response()->json(['message' => 'Photo uploaded.', 'photo_path' => $path]);
    }

    public function activate(Request $request, Worker $worker): JsonResponse
    {
        $worker->update(['status' => Worker::STATUS_ACTIVE]);
        $this->audit->log($request->user()->id, 'worker_activated', Worker::class, $worker->id);
        return response()->json(['message' => 'Worker activated.']);
    }

    public function deactivate(Request $request, Worker $worker): JsonResponse
    {
        $worker->update(['status' => Worker::STATUS_INACTIVE]);
        $this->audit->log($request->user()->id, 'worker_deactivated', Worker::class, $worker->id);
        return response()->json(['message' => 'Worker deactivated.']);
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private function authorizeWorkerAccess(User $user, Worker $worker): void
    {
        if ($user->isSuperAdmin()) {
            return;
        }

        if ($user->isVendorUser() && $worker->vendor_id !== $user->vendor_id) {
            abort(403, 'Access denied to this worker.');
        }

        if ($user->isCompanyUser()) {
            $assignedToCompany = $worker->assignments()
                ->where('company_id', $user->company_id)
                ->exists();
            if (! $assignedToCompany) {
                abort(403, 'Worker not assigned to your company.');
            }
        }
    }
}
