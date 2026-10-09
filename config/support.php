<?php

/*
 * "Support the developer" at the bottom of owner pages: a QR code owners can
 * scan to send a tip (e.g. a GCash or Maya "receive money" QR, which is QR Ph).
 */

return [

    // The QR code image: a path under public/ (e.g. /images/support-qr.png)
    // or a full https:// address. Empty: the section is hidden.
    'qr_url' => env('SUPPORT_QR_URL') ?: null,

];
