import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_CONFIGURED } from './config';
import { chromeStorageAdapter } from './storage-adapter';
import type { Database } from './types';

let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Get the Supabase client instance.
 * Returns null if Supabase is not configured.
 */
export function getSupabase(): SupabaseClient<Database> | null {
  if (!SUPABASE_CONFIGURED) {
    return null;
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        storage: chromeStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }

  return supabaseInstance;
}

/**
 * Supabase client instance (may be null if not configured)
 */
export const supabase = getSupabase();

/**
 * Check if Supabase is configured and ready.
 */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_CONFIGURED;
}
