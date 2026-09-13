import { getCurrentSession } from './auth';
import { SUPABASE_ANON_KEY, SUPABASE_CONFIGURED, SUPABASE_URL } from './config';

export type ActivityEventType =
  | 'sign_in'
  | 'sign_out'
  | 'session_refresh'
  | 'scan_started'
  | 'batch_scan_started'
  | 'scan_completed'
  | 'audit_run'
  | 'quick_scan'
  | 'deep_scan'
  | 'local_scan'
  | 'license_activated'
  | 'csv_export'
  | 'quota_denied'
  | 'feedback_sent';

/** Fire-and-forget activity log for the admin dashboard. Never throws. */
export function logActivity(
  eventType: ActivityEventType,
  metadata: Record<string, unknown> = {}
): void {
  if (!SUPABASE_CONFIGURED) return;

  void (async () => {
    try {
      const session = await getCurrentSession();
      const token = session?.access_token;
      if (!token) return;

      await fetch(`${SUPABASE_URL}/functions/v1/log-activity`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: eventType,
          metadata,
          extension_version: chrome.runtime.getManifest().version,
        }),
      });
    } catch {
      // Non-critical — ignore
    }
  })();
}
