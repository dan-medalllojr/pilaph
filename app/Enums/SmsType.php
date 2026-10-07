<?php

namespace App\Enums;

enum SmsType: string
{
    /** "2 people ahead of you": time to head back. */
    case Near = 'near';
    /** "Please proceed to Chair 2". */
    case Called = 'called';
}
