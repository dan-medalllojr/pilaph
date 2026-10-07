<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Realtime Broadcast for live queue updates (server side only).
    // The key may be a secret key (sb_secret_...) or the legacy service_role JWT.
    'supabase' => [
        'url' => env('SUPABASE_URL'),
        'service_role_key' => env('SUPABASE_SERVICE_ROLE_KEY'),
    ],

    // Texts to customers. SMS_DRIVER=log writes them to the log instead of
    // sending them (development); SMS_DRIVER=semaphore sends real SMS.
    'sms' => [
        'driver' => env('SMS_DRIVER', 'log'),
    ],

    // SEMAPHORE_SENDER_NAME must be approved by Semaphore first; leave it
    // empty to send as their default sender.
    'semaphore' => [
        'api_key' => env('SEMAPHORE_API_KEY'),
        'sender_name' => env('SEMAPHORE_SENDER_NAME'),
        'url' => 'https://api.semaphore.co/api/v4',
    ],

    // Owner sign-in with Google. Google sends people back to /auth/google/callback
    // on whatever domain the app runs on; add each one in Google Cloud Console.
    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => '/auth/google/callback',
    ],

];
