import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Browser client for Realtime only (no Supabase Auth): uses the publishable
 * key, never the server's secret key. Null when not configured, in which case
 * pages fall back to polling.
 */
export const supabase: SupabaseClient | null =
    url && key
        ? createClient(url, key, {
              auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;
