<?php

namespace App\Enums;

enum PaymentStatus: string
{
    // Sent to HitPay's checkout; not paid (yet).
    case Pending = 'pending';
    case Paid = 'paid';
    // HitPay couldn't take it, or couldn't be reached to start it.
    case Failed = 'failed';
}
