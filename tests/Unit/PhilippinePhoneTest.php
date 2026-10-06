<?php

use App\Support\PhilippinePhone;

test('Philippine mobile numbers are normalized to 639XXXXXXXXX', function (string $input) {
    expect(PhilippinePhone::normalize($input))->toBe('639171234567');
})->with([
    'local' => '09171234567',
    'local with spaces' => '0917 123 4567',
    'international' => '+63 917-123-4567',
    'international without plus' => '639171234567',
    'without leading zero' => '9171234567',
]);

test('anything else is rejected', function (?string $input) {
    expect(PhilippinePhone::normalize($input))->toBeNull();
})->with([
    'empty' => '',
    'null' => null,
    'too short' => '0917123456',
    'landline' => '(02) 8123 4567',
    'not a mobile prefix' => '08171234567',
    'foreign number' => '+1 415 555 0100',
    'letters' => 'call me',
]);
