import { getSupabaseClient, getSupabaseUrl } from './supabase/client';

export async function callAdminApi<T = unknown>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    throw new Error('Not signed in');
  }

  const url = `${getSupabaseUrl()}/functions/v1/admin-api`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }

  return data as T;
}
