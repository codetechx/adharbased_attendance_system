<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WorkerAssignment extends Model
{
    use HasFactory;

    public const STATUS_ACTIVE    = 'active';
    public const STATUS_CANCELLED = 'cancelled';
    public const STATUS_COMPLETED = 'completed';

    protected $fillable = [
        'worker_id',
        'company_id',
        'vendor_id',
        'assignment_date',
        'shift',
        'gate',
        'status',
        'assigned_by',
        'notes',
    ];

    protected $casts = [
        'assignment_date' => 'date',
    ];

    // ─── Relationships ─────────────────────────────────────────────────────────

    public function worker()
    {
        return $this->belongsTo(Worker::class);
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }

    public function assignedBy()
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    public function attendanceLogs()
    {
        return $this->hasMany(AttendanceLog::class, 'assignment_id');
    }

    // ─── Scopes ───────────────────────────────────────────────────────────────

    public function scopeForToday($query)
    {
        return $query->whereDate('assignment_date', today())->where('status', self::STATUS_ACTIVE);
    }

    public function scopeForCompany($query, int $companyId)
    {
        return $query->where('company_id', $companyId);
    }

    public function scopeForVendor($query, int $vendorId)
    {
        return $query->where('vendor_id', $vendorId);
    }
}
