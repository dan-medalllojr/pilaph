<?php

namespace App\Enums;

enum SmsStatus: string
{
    /** Semaphore accepted it. */
    case Sent = 'sent';
    /** Semaphore refused it, failed, or couldn't be reached. */
    case Failed = 'failed';
    /** SMS_DRIVER=log: written to the log instead of sent (development). */
    case Logged = 'logged';
}
