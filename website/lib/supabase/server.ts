import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl } from './client';

let adminClient: SupabaseClient | null = null;

export function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
}

export function isSupabaseAdminConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

/** Server-only Supabase client (service role). Never import from client components. */
export function getSupabaseAdminClient() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error(
      'Supabase admin is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  if (!adminClient) {
    adminClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return adminClient;
}
