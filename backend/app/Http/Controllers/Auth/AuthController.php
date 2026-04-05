<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function __construct(private AuditService $audit) {}

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            $this->audit->log(null, 'login_failed', null, null, [
                'email'      => $data['email'],
                'ip_address' => $request->ip(),
            ]);
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        if (! $user->is_active) {
            return response()->json(['message' => 'Account is disabled. Contact administrator.'], 403);
        }

        $token = $user->createToken('auth_token', ['*'], now()->addDays(7))->plainTextToken;

        $this->audit->log($user->id, 'login', null, null, ['ip' => $request->ip()]);

        return response()->json([
            'token' => $token,
            'user'  => $this->userResponse($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $this->audit->log($request->user()->id, 'logout');
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully.']);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load(['company', 'vendor']);
        return response()->json($this->userResponse($user));
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => 'required|string',
            'password'         => ['required', 'confirmed', Password::min(8)->letters()->numbers()],
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            return response()->json(['message' => 'Current password is incorrect.'], 422);
        }

        $user->update(['password' => $data['password']]);
        $this->audit->log($user->id, 'password_changed');

        return response()->json(['message' => 'Password changed successfully.']);
    }

    private function userResponse(User $user): array
    {
        return [
            'id'         => $user->id,
            'name'       => $user->name,
            'email'      => $user->email,
            'role'       => $user->role,
            'company_id' => $user->company_id,
            'vendor_id'  => $user->vendor_id,
            'company'    => $user->company ? ['id' => $user->company->id, 'name' => $user->company->name] : null,
            'vendor'     => $user->vendor ? ['id' => $user->vendor->id, 'name' => $user->vendor->name] : null,
            'is_active'  => $user->is_active,
        ];
    }
}
