<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Worker extends Model
{
    use HasFactory, SoftDeletes;

    public const STATUS_PENDING    = 'pending';    // Aadhaar uploaded, not yet complete
    public const STATUS_ACTIVE     = 'active';     // Aadhaar + fingerprint done
    public const STATUS_INACTIVE   = 'inactive';
    public const STATUS_BLOCKED    = 'blocked';

    protected $fillable = [
        'vendor_id',
        'name',
        'dob',
        'gender',
        'address',
        'city',
        'state',
        'pin',
        'phone',
        'mobile',
        'aadhaar_number_masked',   // last 4 digits only
        'aadhaar_pdf_path',        // encrypted path
        'aadhaar_data_extracted',  // json of extracted fields
        'photo_path',
        'fingerprint_template',    // base64 encoded SecuGen FMD
        'fingerprint_enrolled_at',
        'fingerprint_quality',
        'status',
        'notes',
        'registered_by',
    ];

    protected $hidden = [
        'aadhaar_pdf_path',        // don't expose path in API responses
        'fingerprint_template',    // never expose raw template
    ];

    protected $casts = [
        'dob'                   => 'date',
        'aadhaar_data_extracted' => 'array',
        'fingerprint_enrolled_at' => 'datetime',
    ];

    // ─── Relationships ─────────────────────────────────────────────────────────

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }

    public function assignments()
    {
        return $this->hasMany(WorkerAssignment::class);
    }

    public function activeAssignments()
    {
        return $this->assignments()->where('status', 'active')
            ->whereDate('assignment_date', today());
    }

    public function attendanceLogs()
    {
        return $this->hasMany(AttendanceLog::class);
    }

    public function registeredBy()
    {
        return $this->belongsTo(User::class, 'registered_by');
    }

    // ─── Computed ─────────────────────────────────────────────────────────────

    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo_path
            ? route('worker.photo', ['worker' => $this->id])
            : null;
    }

    public function hasFingerprint(): bool
    {
        return !empty($this->fingerprint_template);
    }

    public function isEnrollmentComplete(): bool
    {
        return $this->hasFingerprint() && !empty($this->aadhaar_number_masked);
    }

    // ─── Scopes ───────────────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('status', self::STATUS_ACTIVE);
    }

    public function scopeForVendor($query, int $vendorId)
    {
        return $query->where('vendor_id', $vendorId);
    }
}
