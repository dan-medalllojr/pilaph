<?php

namespace App\Enums;

enum UserRole: string
{
    // Manages the business: settings, services, counters, and the queue.
    case Owner = 'owner';

    // Not used in v1; reserved for helpers who only run the queue.
    case Staff = 'staff';
}
