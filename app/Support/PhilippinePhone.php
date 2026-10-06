<?php

namespace App\Support;

final class PhilippinePhone
{
    /**
     * Normalize a Philippine mobile number to 639XXXXXXXXX (the format
     * Semaphore expects), or return null if it isn't one.
     *
     * Accepts e.g. "0917 123 4567", "+63 917-123-4567", "639171234567"
     * and "9171234567".
     */
    public static function normalize(?string $input): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $input) ?? '';

        $local = match (true) {
            strlen($digits) === 12 && str_starts_with($digits, '63') => substr($digits, 2),
            strlen($digits) === 11 && str_starts_with($digits, '0') => substr($digits, 1),
            strlen($digits) === 10 => $digits,
            default => null,
        };

        // Mobile numbers start with 9 after the country code.
        return $local !== null && str_starts_with($local, '9') ? '63'.$local : null;
    }
}
