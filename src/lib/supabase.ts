import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// The publishable key (Supabase dashboard naming); VITE_SUPABASE_ANON_KEY still works for older setups.
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

/**
 * null when the env vars are missing: the app then runs on localStorage only (handy offline or
 * for a quick local test). The anon key is public by design; row-level security protects the data.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // Implicit flow so a magic link requested on the laptop can be opened on the phone.
          flowType: 'implicit',
        },
      })
    : null;
