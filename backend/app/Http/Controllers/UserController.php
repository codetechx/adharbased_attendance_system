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
        $users = User::with(['company:id,name', 'vendor:id,name'])
            ->when($request->role, fn($q, $r) => $q->where('role', $r))
            ->when($request->company_id, fn($q, $id) => $q->where('company_id', $id))
            ->when($request->vendor_id, fn($q, $id) => $q->where('vendor_id', $id))
            ->orderBy('name')
            ->paginate(30);

        return response()->json($users);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'       => 'required|string|max:100',
            'email'      => 'required|email|unique:users',
            'password'   => ['required', Password::min(8)->letters()->numbers()],
            'role'       => 'required|in:' . implode(',', User::ROLES),
            'company_id' => 'nullable|integer|exists:companies,id',
            'vendor_id'  => 'nullable|integer|exists:vendors,id',
            'phone'      => 'nullable|string|max:15',
        ]);

        $data['is_active'] = true;
        $user = User::create($data);

        $this->audit->log($request->user()->id, 'user_created', User::class, $user->id);

        return response()->json($user, 201);
    }

    public function show(User $user): JsonResponse
    {
        return response()->json($user->load(['company:id,name', 'vendor:id,name']));
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'name'       => 'sometimes|string|max:100',
            'email'      => "sometimes|email|unique:users,email,{$user->id}",
            'role'       => 'sometimes|in:' . implode(',', User::ROLES),
            'company_id' => 'nullable|integer|exists:companies,id',
            'vendor_id'  => 'nullable|integer|exists:vendors,id',
            'phone'      => 'nullable|string|max:15',
            'is_active'  => 'sometimes|boolean',
        ]);

        $user->update($data);
        $this->audit->log($request->user()->id, 'user_updated', User::class, $user->id);

        return response()->json($user->fresh());
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'Cannot delete your own account.'], 422);
        }

        $user->delete();
        $this->audit->log($request->user()->id, 'user_deleted', User::class, $user->id);

        return response()->json(['message' => 'User deleted.']);
    }
}
