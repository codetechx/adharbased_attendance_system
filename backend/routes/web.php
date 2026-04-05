<?php

use Illuminate\Support\Facades\Route;

// Health check (used by Docker and load balancers)
Route::get('/up', function () {
    return response()->json(['status' => 'ok', 'service' => 'ams-backend']);
});

// All application logic is in api.php routes (/api/*)
// This file intentionally has no web routes.
