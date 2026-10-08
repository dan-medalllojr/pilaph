<?php

use App\Actions\ResetDemoShop;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

test('the admin sets a new password; the owner can log in with it and is signed out elsewhere', function () {
    $owner = User::factory()->owner()->create(['email' => 'ana@example.com']);
    DB::table('sessions')->insert(['id' => 'old-session', 'user_id' => $owner->id, 'payload' => '', 'last_activity' => time()]);

    $this->artisan('user:password', ['email' => 'ANA@example.com'])
        ->expectsQuestion('New password', 'a-new-password-123')
        ->expectsQuestion('Type it again', 'a-new-password-123')
        ->assertSuccessful();

    expect(Hash::check('a-new-password-123', $owner->fresh()->password))->toBeTrue()
        ->and(DB::table('sessions')->where('user_id', $owner->id)->count())->toBe(0);

    $this->post(route('login'), ['email' => 'ana@example.com', 'password' => 'a-new-password-123']);
    $this->assertAuthenticatedAs($owner);
});

test('--verify unlocks an owner stuck on "verify your email"', function () {
    $owner = User::factory()->unverified()->create(['email' => 'ben@example.com']);

    $this->artisan('user:password', ['email' => 'ben@example.com', '--verify' => true])
        ->expectsQuestion('New password', 'a-new-password-123')
        ->expectsQuestion('Type it again', 'a-new-password-123')
        ->assertSuccessful();

    expect($owner->fresh()->hasVerifiedEmail())->toBeTrue();
});

test('nothing changes on a typo, a mismatch or a weak password', function (string $password, string $again) {
    $owner = User::factory()->create(['email' => 'cora@example.com']);
    $before = $owner->password;

    $this->artisan('user:password', ['email' => 'cora@example.com'])
        ->expectsQuestion('New password', $password)
        ->expectsQuestion('Type it again', $again)
        ->assertFailed();

    expect($owner->fresh()->password)->toBe($before);
})->with([
    'mismatch' => ['a-new-password-123', 'a-new-password-124'],
    'too short' => ['short', 'short'],
]);

test('unknown accounts and the demo account are refused', function () {
    $this->artisan('user:password', ['email' => 'nobody@example.com'])->assertFailed();

    app(ResetDemoShop::class)->execute();
    $this->artisan('user:password', ['email' => config('demo.email')])->assertFailed();
});
