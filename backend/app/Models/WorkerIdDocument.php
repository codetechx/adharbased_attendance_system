<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WorkerIdDocument extends Model
{
    public const TYPES = ['aadhaar', 'pan', 'driving_licence', 'voter_id', 'passport', 'other'];

    public const TYPE_LABELS = [
        'aadhaar'         => 'Aadhaar Card',
        'pan'             => 'PAN Card',
        'driving_licence' => 'Driving Licence',
        'voter_id'        => 'Voter ID',
        'passport'        => 'Passport',
        'other'           => 'Other',
    ];

    protected $fillable = [
        'worker_id',
        'id_type',
        'id_number_masked',
        'id_data_extracted',
        'document_path',
        'is_primary',
    ];

    protected $hidden  = ['document_path'];
    protected $appends = ['has_document', 'type_label'];

    protected $casts = [
        'id_data_extracted' => 'array',
        'is_primary'        => 'boolean',
    ];

    public function worker()
    {
        return $this->belongsTo(Worker::class);
    }

    public function getTypeLabelAttribute(): string
    {
        return self::TYPE_LABELS[$this->id_type] ?? 'Other';
    }

    public function getHasDocumentAttribute(): bool
    {
        return !empty($this->document_path);
    }
}
