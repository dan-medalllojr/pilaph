<?php

use App\Enums\TicketStatus;

test('only waiting and called tickets hold a place in the queue', function (TicketStatus $status, bool $active) {
    expect($status->isActive())->toBe($active);
})->with([
    'waiting' => [TicketStatus::Waiting, true],
    'called' => [TicketStatus::Called, true],
    'done' => [TicketStatus::Done, false],
    'no-show' => [TicketStatus::NoShow, false],
    'cancelled' => [TicketStatus::Cancelled, false],
]);
