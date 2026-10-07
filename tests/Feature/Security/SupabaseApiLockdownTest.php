<?php

use App\Models\User;
use App\Support\SupabaseApiLockdown;
use Illuminate\Database\Events\MigrationsEnded;
use Illuminate\Support\Facades\DB;

/*
 * Supabase grants its REST API roles (anon, authenticated) access to new
 * tables in `public`; the key they accept ships in the browser. The local
 * test database gets the same two roles so the lockdown can be checked.
 */
beforeEach(function () {
    foreach (['anon', 'authenticated'] as $role) {
        DB::statement("do \$\$ begin if not exists (select from pg_roles where rolname = '{$role}') then create role {$role} nologin; end if; end \$\$");
    }
});

test('on Supabase, every table gets RLS and the public API roles lose access', function () {
    DB::statement('alter table users disable row level security');
    DB::statement('grant select, insert on users, tickets, jobs to anon, authenticated');

    expect(SupabaseApiLockdown::apply(DB::connection()))->toBeTrue();

    $withoutRls = DB::scalar("select count(*) from pg_tables where schemaname = 'public' and not rowsecurity");
    $apiGrants = DB::scalar("select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')");
    expect($withoutRls)->toBe(0)->and($apiGrants)->toBe(0);
});

test('the app itself (the tables\' owner) still reads and writes as before', function () {
    SupabaseApiLockdown::apply(DB::connection());

    $owner = User::factory()->owner()->create();

    expect(User::query()->whereKey($owner->id)->exists())->toBeTrue();
});

test('tables created by later migrations are locked down too', function () {
    DB::statement('create table later_table (id int)');
    DB::statement('grant select on later_table to anon');

    event(new MigrationsEnded('up'));

    expect(DB::scalar("select rowsecurity from pg_tables where tablename = 'later_table'"))->toBeTrue()
        ->and(DB::scalar("select count(*) from information_schema.role_table_grants where table_name = 'later_table' and grantee = 'anon'"))->toBe(0);
});
