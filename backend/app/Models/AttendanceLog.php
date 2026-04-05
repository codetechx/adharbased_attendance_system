<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AttendanceLog extends Model
{
    use HasFactory;

    public const TYPE_IN  = 'IN';
    public const TYPE_OUT = 'OUT';

    public const METHOD_FINGERPRINT = 'fingerprint';
    public const METHOD_MANUAL      = 'manual';

    protected $fillable = [
        'worker_id',
        'company_id',
        'assignment_id',
        'type',
        'marked_at',
        'marked_by',
        'method',
        'fingerprint_score',     // match score 0-100
        'override_reason',       // if manual
        'device_id',
        'gate',
        'ip_address',
        'is_valid',
        'invalidation_reason',
    ];

    protected $casts = [
        'marked_at'  => 'datetime',
        'is_valid'   => 'boolean',
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

    public function assignment()
    {
        return $this->belongsTo(WorkerAssignment::class);
    }

    public function markedBy()
    {
        return $this->belongsTo(User::class, 'marked_by');
    }

    // ─── Scopes ───────────────────────────────────────────────────────────────

    public function scopeToday($query)
    {
        return $query->whereDate('marked_at', today());
    }

    public function scopeValid($query)
    {
        return $query->where('is_valid', true);
    }

    public function scopeForCompany($query, int $companyId)
    {
        return $query->where('company_id', $companyId);
    }
}
