<?php

use App\Models\Business;
use App\Models\Service;
use App\Models\Ticket;

test('one address can check a page 300 times a minute, then waits', function () {
    $business = Business::factory()->create();
    $state = route('display.state', $business->display_token);

    foreach (range(1, 300) as $i) {
        $this->getJson($state)->assertOk();
    }

    $this->getJson($state)->assertTooManyRequests();

    // A minute later it's fine again.
    $this->travel(61)->seconds();
    $this->getJson($state)->assertOk();
});

test('the limit is per page, so many phones on a shop\'s Wi-Fi each get their own', function () {
    $service = Service::factory()->create();
    [$first, $second] = Ticket::factory()->count(2)->for($service)->sequence(['number' => 1, 'code' => 'A-001'], ['number' => 2, 'code' => 'A-002'])->create();

    foreach (range(1, 300) as $i) {
        $this->getJson(route('tickets.state', $first))->assertOk();
    }

    $this->getJson(route('tickets.state', $first))->assertTooManyRequests();
    $this->getJson(route('tickets.state', $second))->assertOk();
});
