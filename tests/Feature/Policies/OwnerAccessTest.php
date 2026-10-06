<?php

use App\Models\Business;
use App\Models\Counter;
use App\Models\Service;
use App\Models\Ticket;
use App\Models\User;

beforeEach(function () {
    $this->owner = User::factory()->owner()->create();
    $this->business = $this->owner->business;

    $this->service = Service::factory()->for($this->business)->create();
    $this->counter = Counter::factory()->for($this->business)->create();
    $this->ticket = Ticket::factory()->for($this->service)->create();

    $this->otherOwner = User::factory()->owner()->create();
});

test('an owner manages their own business', function () {
    $owner = $this->owner;

    expect($owner->can('view', $this->business))->toBeTrue()
        ->and($owner->can('update', $this->business))->toBeTrue()
        ->and($owner->can('viewAny', Service::class))->toBeTrue()
        ->and($owner->can('create', Service::class))->toBeTrue()
        ->and($owner->can('update', $this->service))->toBeTrue()
        ->and($owner->can('delete', $this->service))->toBeTrue()
        ->and($owner->can('create', Counter::class))->toBeTrue()
        ->and($owner->can('update', $this->counter))->toBeTrue()
        ->and($owner->can('delete', $this->counter))->toBeTrue()
        ->and($owner->can('callNext', $this->counter))->toBeTrue()
        ->and($owner->can('view', $this->ticket))->toBeTrue()
        ->and($owner->can('update', $this->ticket))->toBeTrue()
        ->and($owner->can('delete', $this->ticket))->toBeTrue();
});

test("an owner cannot touch another business's data", function () {
    $other = $this->otherOwner;

    expect($other->can('view', $this->business))->toBeFalse()
        ->and($other->can('update', $this->business))->toBeFalse()
        ->and($other->can('view', $this->service))->toBeFalse()
        ->and($other->can('update', $this->service))->toBeFalse()
        ->and($other->can('delete', $this->service))->toBeFalse()
        ->and($other->can('update', $this->counter))->toBeFalse()
        ->and($other->can('delete', $this->counter))->toBeFalse()
        ->and($other->can('callNext', $this->counter))->toBeFalse()
        ->and($other->can('view', $this->ticket))->toBeFalse()
        ->and($other->can('update', $this->ticket))->toBeFalse()
        ->and($other->can('delete', $this->ticket))->toBeFalse();
});

test('a user without a business cannot manage anything yet', function () {
    $newUser = User::factory()->create();

    expect($newUser->business_id)->toBeNull()
        ->and($newUser->can('viewAny', Service::class))->toBeFalse()
        ->and($newUser->can('create', Service::class))->toBeFalse()
        ->and($newUser->can('create', Counter::class))->toBeFalse()
        ->and($newUser->can('viewAny', Ticket::class))->toBeFalse()
        ->and($newUser->can('view', $this->business))->toBeFalse();
});

test('staff can run the queue but not change the setup', function () {
    $staff = User::factory()->staff($this->business)->create();

    expect($staff->can('callNext', $this->counter))->toBeTrue()
        ->and($staff->can('update', $this->ticket))->toBeTrue()
        ->and($staff->can('view', $this->business))->toBeTrue()
        ->and($staff->can('update', $this->business))->toBeFalse()
        ->and($staff->can('create', Service::class))->toBeFalse()
        ->and($staff->can('update', $this->service))->toBeFalse()
        ->and($staff->can('delete', $this->counter))->toBeFalse()
        ->and($staff->can('delete', $this->ticket))->toBeFalse();
});

test('business_id and role cannot be mass-assigned', function () {
    $user = User::factory()->create();
    $business = Business::factory()->create();

    $user->fill(['business_id' => $business->id, 'role' => 'owner', 'name' => 'Renamed']);

    expect($user->isDirty('name'))->toBeTrue()
        ->and($user->isDirty('business_id'))->toBeFalse()
        ->and($user->isDirty('role'))->toBeFalse();
});
