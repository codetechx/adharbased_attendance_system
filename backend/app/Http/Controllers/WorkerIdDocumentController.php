<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Worker;
use App\Models\WorkerIdDocument;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class WorkerIdDocumentController extends Controller
{
    public function __construct(private AuditService $audit) {}

    public function index(Request $request, Worker $worker): JsonResponse
    {
        $this->authorizeAccess($request->user(), $worker);

        return response()->json($worker->idDocuments()->orderByDesc('is_primary')->get());
    }

    public function store(Request $request, Worker $worker): JsonResponse
    {
        $this->authorizeAccess($request->user(), $worker);

        $data = $request->validate([
            'id_type'          => 'required|in:aadhaar,pan,driving_licence,voter_id,passport,other',
            'id_number_masked' => 'nullable|string|max:50',
            'is_primary'       => 'boolean',
        ]);

        if ($request->hasFile('document_image')) {
            $request->validate(['document_image' => 'required|image|max:4096|mimes:jpeg,png,jpg']);
            $data['document_path'] = $request->file('document_image')
                ->store('workers/documents', 'private');
        }

        // Unmark any existing primary before setting a new one
        if (! empty($data['is_primary'])) {
            $worker->idDocuments()->update(['is_primary' => false]);
        }

        $doc = $worker->idDocuments()->create($data);

        $this->audit->log($request->user()->id, 'id_document_added', Worker::class, $worker->id, [
            'id_type' => $data['id_type'],
        ]);

        return response()->json($doc, 201);
    }

    public function destroy(Request $request, Worker $worker, WorkerIdDocument $document): JsonResponse
    {
        $this->authorizeAccess($request->user(), $worker);

        if ($document->worker_id !== $worker->id) {
            abort(404);
        }

        if ($document->document_path) {
            Storage::disk('private')->delete($document->document_path);
        }

        $document->delete();

        $this->audit->log($request->user()->id, 'id_document_deleted', Worker::class, $worker->id);

        return response()->json(['message' => 'Document removed.']);
    }

    private function authorizeAccess(User $user, Worker $worker): void
    {
        if ($user->isSuperAdmin()) {
            return;
        }

        if ($user->isVendorUser() && $worker->vendor_id !== $user->vendor_id) {
            abort(403, 'Access denied.');
        }

        if ($user->isCompanyUser()) {
            abort(403, 'Company users cannot manage worker documents.');
        }
    }
}
