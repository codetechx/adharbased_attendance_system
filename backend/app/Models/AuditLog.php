<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    public const UPDATED_AT = null; // audit logs are immutable

    protected $fillable = [
        'user_id',
        'action',
        'model_type',
        'model_id',
        'description',
        'before',
        'after',
        'ip_address',
        'user_agent',
        'metadata',
    ];

    protected $casts = [
        'before'   => 'array',
        'after'    => 'array',
        'metadata' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function subject()
    {
        return $this->morphTo('model');
    }
}
