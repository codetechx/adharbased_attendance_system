<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Password;

class UserController extends Controller
{
    public function __construct(private AuditService $audit) {}

    public function index(Request $request): JsonResponse
    {
        $auth = $request->user();

        $users = User::select(['id','name','email','role','company_id','vendor_id','phone','is_active','location_type','location_name'])
            ->with(['company:id,name', 'vendor:id,name'])
            // company_admin only sees their own gate users
            ->when($auth->role === 'company_admin', fn($q) =>
                $q->where('company_id', $auth->company_id)->where('role', 'company_gate')
            )
            // super_admin can filter freely
            ->when($auth->isSuperAdmin() && $request->role,       fn($q, $r)  => $q->where('role', $r))
            ->when($auth->isSuperAdmin() && $request->company_id, fn($q, $id) => $q->where('company_id', $id))
            ->when($auth->isSuperAdmin() && $request->vendor_id,  fn($q, $id) => $q->where('vendor_id', $id))
            ->orderBy('name')
            ->paginate(30);

        return response()->json($users);
    }

    public function store(Request $request): JsonResponse
    {
        $auth = $request->user();

        if ($auth->role === 'company_admin') {
            // company_admin can only create gate users for their own company
            $data = $request->validate([
                'name'          => 'required|string|max:100',
                'email'         => 'required|email|unique:users',
                'password'      => ['required', Password::min(8)->letters()->numbers()],
                'phone'         => 'nullable|string|max:15',
                'location_type' => 'nullable|in:main_gate,department,checkpoint',
                'location_name' => 'nullable|string|max:100',
            ]);
            $data['role']       = 'company_gate';
            $data['company_id'] = $auth->company_id;
            $data['is_active']  = true;
            $user = User::create($data);
            $this->audit->log($auth->id, 'user_created', User::class, $user->id);
            return response()->json($user, 201);
        }

        $data = $request->validate([
            'name'          => 'required|string|max:100',
            'email'         => 'required|email|unique:users',
            'password'      => ['required', Password::min(8)->letters()->numbers()],
            'role'          => 'required|in:' . implode(',', User::ROLES),
            'company_id'    => 'nullable|integer|exists:companies,id',
            'vendor_id'     => 'nullable|integer|exists:vendors,id',
            'phone'         => 'nullable|string|max:15',
            'location_type' => 'nullable|in:main_gate,department,checkpoint',
            'location_name' => 'nullable|string|max:100',
        ]);

        $data['is_active'] = true;
        $user = User::create($data);

        $this->audit->log($auth->id, 'user_created', User::class, $user->id);

        return response()->json($user, 201);
    }

    public function show(User $user): JsonResponse
    {
        return response()->json($user->load(['company:id,name', 'vendor:id,name']));
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $auth = $request->user();

        if ($auth->role === 'company_admin') {
            if ($user->company_id !== $auth->company_id || $user->role !== 'company_gate') {
                abort(403, 'You can only edit gate users for your own company.');
            }

            $data = $request->validate([
                'name'          => 'sometimes|string|max:100',
                'email'         => "sometimes|email|unique:users,email,{$user->id}",
                'phone'         => 'nullable|string|max:15',
                'is_active'     => 'sometimes|boolean',
                'location_type' => 'nullable|in:main_gate,department,checkpoint',
                'location_name' => 'nullable|string|max:100',
            ]);
            $user->update($data);
            $this->audit->log($auth->id, 'user_updated', User::class, $user->id);
            return response()->json($user->fresh());
        }

        $data = $request->validate([
            'name'          => 'sometimes|string|max:100',
            'email'         => "sometimes|email|unique:users,email,{$user->id}",
            'role'          => 'sometimes|in:' . implode(',', User::ROLES),
            'company_id'    => 'nullable|integer|exists:companies,id',
            'vendor_id'     => 'nullable|integer|exists:vendors,id',
            'phone'         => 'nullable|string|max:15',
            'is_active'     => 'sometimes|boolean',
            'location_type' => 'nullable|in:main_gate,department,checkpoint',
            'location_name' => 'nullable|string|max:100',
        ]);

        $user->update($data);
        $this->audit->log($auth->id, 'user_updated', User::class, $user->id);

        return response()->json($user->fresh());
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $auth = $request->user();

        if ($auth->id === $user->id) {
            return response()->json(['message' => 'Cannot delete your own account.'], 422);
        }

        if ($auth->role === 'company_admin' && ($user->company_id !== $auth->company_id || $user->role !== 'company_gate')) {
            abort(403, 'You can only delete gate users for your own company.');
        }

        $user->delete();
        $this->audit->log($auth->id, 'user_deleted', User::class, $user->id);

        return response()->json(['message' => 'User deleted.']);
    }
}
