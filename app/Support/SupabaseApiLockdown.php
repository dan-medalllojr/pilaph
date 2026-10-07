<?php

namespace App\Support;

use Illuminate\Database\Connection;
use Illuminate\Database\PostgresConnection;

/**
 * Keeps Supabase's auto-generated REST API (PostgREST) away from the app's
 * tables. Supabase grants its API roles (`anon`, `authenticated`) access to
 * every new table in `public`, and the key those roles accept is the
 * publishable key that ships in the browser for Realtime. Without this,
 * anyone could read or change users, tickets, sessions and queued jobs.
 *
 * The app itself connects as the tables' owner, which row level security
 * doesn't restrict, so it is unaffected. Runs only where those roles exist.
 */
final class SupabaseApiLockdown
{
    public static function apply(Connection $db): bool
    {
        if (! $db instanceof PostgresConnection || ! self::hasApiRoles($db)) {
            return false;
        }

        $db->transaction(function () use ($db) {
            foreach ($db->select("select tablename from pg_tables where schemaname = 'public'") as $table) {
                $db->statement('alter table public.'.self::quote($table->tablename).' enable row level security');
            }

            foreach (['tables', 'sequences', 'functions'] as $kind) {
                $db->statement("revoke all on all {$kind} in schema public from anon, authenticated");
                // Tables later migrations create aren't granted to them either.
                $db->statement("alter default privileges in schema public revoke all on {$kind} from anon, authenticated");
            }
        });

        return true;
    }

    private static function hasApiRoles(Connection $db): bool
    {
        return (int) $db->scalar("select count(*) from pg_roles where rolname in ('anon', 'authenticated')") === 2;
    }

    private static function quote(string $identifier): string
    {
        return '"'.str_replace('"', '""', $identifier).'"';
    }
}
