<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key'    => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel'              => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | AMS Internal Services
    |--------------------------------------------------------------------------
    */

    // Python PDF / Aadhaar extraction microservice
    'pdf_service' => [
        'url'     => env('PDF_SERVICE_URL', 'http://pdf-service:8001'),
        'timeout' => env('PDF_SERVICE_TIMEOUT', 60),
    ],

    // Biometric agent (local Windows service — only used if doing server-side
    // matching via the agent; otherwise matching happens in BiometricService.php)
    'biometric_agent' => [
        'ws_url' => env('BIOMETRIC_AGENT_URL', 'ws://host.docker.internal:12345'),
    ],

];
