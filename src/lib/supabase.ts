import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
// The publishable key (Supabase dashboard naming); VITE_SUPABASE_ANON_KEY still works for older setups.
const key = ((import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined)?.trim();

/**
 * Set when the env vars are there but unusable (for example the whole `NAME=value` line pasted
 * as the value), so the app explains it instead of showing a blank page.
 */
export let configError = '';

function connect(): SupabaseClient | null {
  if (!url || !key) return null;
  if (!/^https:\/\/[^\s/]+$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
    configError = 'VITE_SUPABASE_URL must be your Supabase Project URL, like https://abcdefghijkl.supabase.co (nothing before https://, no slash at the end).';
    return null;
  }
  try {
    return createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Implicit flow so a magic link requested on the laptop can be opened on the phone.
        flowType: 'implicit',
      },
    });
  } catch (e) {
    configError = `The Supabase settings were refused: ${e instanceof Error ? e.message : String(e)}`;
    return null;
  }
}

/**
 * null when the env vars are missing: the app then runs on localStorage only (handy offline or
 * for a quick local test). The publishable key is public by design; row-level security protects the data.
 */
export const supabase: SupabaseClient | null = connect();
