<?php

use App\Services\QueueEstimator;

test('work ahead adds each waiting ticket\'s own service time, by its letter', function () {
    $averages = ['A' => 20.0, 'B' => 10.0, 'HC' => 45.0];

    expect((new QueueEstimator)->minutesOfWork(['A-001', 'B-001', 'HC-001'], $averages))->toBe(75.0)
        ->and((new QueueEstimator)->minutesOfWork([], $averages))->toBe(0.0);
});

test('active counters share the work ahead; the wait is rounded up', function (float $work, int $counters, int $expected) {
    expect((new QueueEstimator)->waitMinutes($work, $counters))->toBe($expected);
})->with([
    'one counter' => [30.0, 1, 30],
    'two counters' => [45.0, 2, 23],
    'nobody ahead' => [0.0, 3, 0],
    'no active counters counts as one' => [20.0, 0, 20],
]);

test('waits are shown as a 5-minute range', function (int $minutes, array $range) {
    expect((new QueueEstimator)->range($minutes))->toBe($range);
})->with([
    [0, ['min' => 0, 'max' => 5]],
    [4, ['min' => 0, 'max' => 5]],
    [12, ['min' => 10, 'max' => 15]],
    [45, ['min' => 45, 'max' => 50]],
]);
