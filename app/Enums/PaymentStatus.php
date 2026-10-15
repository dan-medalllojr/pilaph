<?php

namespace App\Enums;

enum PaymentStatus: string
{
    // Sent to HitPay's checkout; not paid (yet).
    case Pending = 'pending';
    case Paid = 'paid';
    // HitPay couldn't take it, or couldn't be reached to start it.
    case Failed = 'failed';
    // Left unfinished, and closed at HitPay when the owner chose something
    // else. Still counted if it turns out to have been paid.
    case Cancelled = 'cancelled';
}
