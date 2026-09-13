/**
 * Supabase configuration.
 *
 * IMPORTANT: These are public client-side keys — the anon key is designed to be
 * exposed. All security is enforced via Row Level Security policies in Postgres.
 * Never put your service_role key here.
 *
 * To set up:
 * 1. Create a Supabase project at https://supabase.com
 * 2. Copy your project URL and anon key from Project Settings → API
 * 3. Replace the placeholders below
 */

export const SUPABASE_URL = 'https://ydficltfmssvqbrqpchn.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkZmljbHRmbXNzdnFicnFwY2huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MTI0NDQsImV4cCI6MjEwNDA4ODQ0NH0.mVRYm4NEqe46ABh2uA90AHginwpnsdJhfVJDWkrKxfk';

/** Set to true once you've configured the values above. */
export const SUPABASE_CONFIGURED = true;

/** Owner admin panel (website). Super-admins see a shortcut in the extension. */
export const ADMIN_PANEL_URL = 'https://rankmappro.com/admin';
