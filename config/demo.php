<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Public demo
    |--------------------------------------------------------------------------
    |
    | DEMO_ENABLED=true shows "Try the demo": visitors are signed in as the
    | owner of a sample shop that resets every hour (app/Actions/ResetDemoShop).
    | The demo account can't change its password, email, two-factor or
    | passkeys, can't turn on push alerts, and its shop never sends SMS.
    |
    */

    'enabled' => (bool) env('DEMO_ENABLED', false),

    // A .test address: reserved, so no email can ever reach a real inbox.
    'email' => 'demo@pilaph.test',

];
