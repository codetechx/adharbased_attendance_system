<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Support\Facades\Request;

class AuditService
{
    public function log(
        ?int $userId,
        string $action,
        ?string $modelType = null,
        ?int $modelId = null,
        array $metadata = [],
        array $before = [],
        array $after = []
    ): AuditLog {
        return AuditLog::create([
            'user_id'    => $userId,
            'action'     => $action,
            'model_type' => $modelType,
            'model_id'   => $modelId,
            'before'     => $before ?: null,
            'after'      => $after ?: null,
            'metadata'   => $metadata ?: null,
            'ip_address' => Request::ip(),
            'user_agent' => Request::userAgent(),
        ]);
    }
}
