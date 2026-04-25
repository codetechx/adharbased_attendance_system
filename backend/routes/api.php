<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\CompanyController;
use App\Http\Controllers\VendorController;
use App\Http\Controllers\WorkerController;
use App\Http\Controllers\WorkerAssignmentController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\AadhaarController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\UserController;

// ─── Public Routes ────────────────────────────────────────────────────────────
Route::post('/auth/login', [AuthController::class, 'login']);

// ─── Authenticated Routes ─────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {

    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::put('/auth/password', [AuthController::class, 'changePassword']);

    // ── Dashboard ─────────────────────────────────────────────────────────────
    Route::get('/dashboard/stats', [DashboardController::class, 'stats']);
    Route::get('/dashboard/today-attendance', [DashboardController::class, 'todayAttendance']);
    Route::get('/dashboard/recent-activity', [DashboardController::class, 'recentActivity']);

    // ── Users (Super Admin: all users; Company Admin: their gate users only) ──
    Route::middleware('role:super_admin,company_admin')->group(function () {
        Route::apiResource('users', UserController::class);
    });

    // ── Companies ─────────────────────────────────────────────────────────────
    Route::apiResource('companies', CompanyController::class);

    // Company ↔ Vendor approval
    Route::prefix('companies/{company}')->group(function () {
        Route::get('vendors', [CompanyController::class, 'vendors']);
        Route::post('vendors/{vendor}/approve', [CompanyController::class, 'approveVendor']);
        Route::post('vendors/{vendor}/reject', [CompanyController::class, 'rejectVendor']);
        Route::post('vendors/{vendor}/suspend', [CompanyController::class, 'suspendVendor']);
    });

    // ── Vendors ───────────────────────────────────────────────────────────────
    Route::apiResource('vendors', VendorController::class);

    // Vendor requests access to a company
    Route::post('vendors/{vendor}/request-company/{company}', [VendorController::class, 'requestCompany']);
    Route::get('vendors/{vendor}/companies', [VendorController::class, 'myCompanies']);
    Route::get('vendors/{vendor}/available-companies', [VendorController::class, 'availableCompanies']);

    // ── Workers ───────────────────────────────────────────────────────────────
    Route::apiResource('workers', WorkerController::class);

    // Worker-specific sub-routes
    Route::prefix('workers/{worker}')->group(function () {
        Route::post('fingerprint', [WorkerController::class, 'storeFingerprint']);
        Route::delete('fingerprint', [WorkerController::class, 'deleteFingerprint']);
        Route::post('photo', [WorkerController::class, 'uploadPhoto']);
        Route::post('activate', [WorkerController::class, 'activate']);
        Route::post('deactivate', [WorkerController::class, 'deactivate']);
    });

    // ── Aadhaar Processing ────────────────────────────────────────────────────
    Route::prefix('aadhaar')->group(function () {
        Route::post('extract', [AadhaarController::class, 'extract']);        // PDF → data
        Route::post('upload/{worker}', [AadhaarController::class, 'upload']); // store PDF
        Route::get('download/{worker}', [AadhaarController::class, 'download']); // secure download
    });

    // ── Worker Assignments ────────────────────────────────────────────────────
    Route::apiResource('assignments', WorkerAssignmentController::class);
    Route::get('assignments/company/{company}/today', [WorkerAssignmentController::class, 'todayForCompany']);
    Route::get('assignments/worker/{worker}', [WorkerAssignmentController::class, 'forWorker']);

    // ── Attendance ────────────────────────────────────────────────────────────
    Route::prefix('attendance')->group(function () {
        Route::get('/', [AttendanceController::class, 'index']);
        Route::post('verify', [AttendanceController::class, 'verifyFingerprint']);
        Route::get('worker-templates', [AttendanceController::class, 'workerTemplates']); // for SGIBIOSRV 1:N matching
        Route::post('mark', [AttendanceController::class, 'mark']);
        Route::post('manual', [AttendanceController::class, 'manualMark']);        // manual override
        Route::get('today', [AttendanceController::class, 'today']);
        Route::get('worker/{worker}', [AttendanceController::class, 'workerHistory']);
        Route::get('report', [AttendanceController::class, 'report']);
        Route::get('exceptions', [AttendanceController::class, 'exceptions']);     // missing OUT etc.
    });
});
