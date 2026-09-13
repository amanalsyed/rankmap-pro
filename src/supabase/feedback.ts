import { logActivity } from './activity';
import { getCurrentSession } from './auth';
import { SUPABASE_ANON_KEY, SUPABASE_CONFIGURED, SUPABASE_URL } from './config';

function formatApiError(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return fallback;
}

export type FeedbackCategory = 'bug' | 'feature' | 'general';

export interface FeedbackPayload {
  category: FeedbackCategory;
  message: string;
  email?: string;
  extensionVersion?: string;
  pageUrl?: string;
}

export async function submitFeedback(
  payload: FeedbackPayload
): Promise<{ ok: boolean; error?: string }> {
  if (!SUPABASE_CONFIGURED) {
    return { ok: false, error: 'Feedback is unavailable — Supabase is not configured.' };
  }

  const session = await getCurrentSession();
  const token = session?.access_token;

  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-feedback`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        category: payload.category,
        message: payload.message,
        email: payload.email,
        extensionVersion: payload.extensionVersion ?? chrome.runtime.getManifest().version,
        pageUrl: payload.pageUrl ?? (typeof window !== 'undefined' ? window.location.href : undefined),
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: unknown;
      message?: unknown;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: formatApiError(body.error ?? body.message, `Feedback failed (${res.status})`),
      };
    }

    logActivity('feedback_sent', { category: payload.category });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not send feedback. Check your connection.',
    };
  }
}
