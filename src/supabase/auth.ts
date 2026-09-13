/**
 * Authentication and user management for Supabase.
 */

import type { User, Session, AuthError } from '@supabase/supabase-js';
import { logActivity } from './activity';
import { getSupabase, isSupabaseConfigured } from './client';
import { syncHistoryScopeWithAuth } from '../storage/history-scope';
import type { CachedUserState, Plan, Profile } from './types';
import { emptyCachedUserState, PLAN_LIMITS } from './types';

const USER_STATE_KEY = 'nwf_user_state';

function normalizePlan(plan: string | undefined | null): Plan {
  if (plan === 'pro' || plan === 'lifetime') return plan;
  if (plan === 'starter') return 'pro';
  return 'free';
}

function normalizeProfile(profile: Profile | null): Profile | null {
  if (!profile) return null;
  const plan = normalizePlan(profile.plan);
  return plan === profile.plan ? profile : { ...profile, plan };
}

function normalizeUsage(
  raw: Record<string, unknown> | CachedUserState['usage'] | null,
  plan: Plan
): CachedUserState['usage'] {
  const defaults = PLAN_LIMITS[plan];
  const src = (raw ?? {}) as Record<string, unknown>;

  const num = (key: string, fallback: number): number => {
    const value = src[key];
    return typeof value === 'number' ? value : fallback;
  };

  const limit = (key: string, fallback: number): number => {
    const value = src[key];
    return typeof value === 'number' ? value : fallback;
  };

  return {
    scans_used: num('scans_used', 0),
    scans_limit: limit('scans_limit', defaults.scans_per_month),
    quick_scans_used: num('quick_scans_used', 0),
    quick_scans_limit: limit('quick_scans_limit', defaults.quick_scans_per_month),
    deep_scans_used: num('deep_scans_used', 0),
    deep_scans_limit: limit('deep_scans_limit', defaults.deep_scans_per_month),
    audits_used: num('audits_used', 0),
    audits_limit: limit('audits_limit', defaults.audits_per_month),
    enrichment_scans_used: num('enrichment_scans_used', 0),
    enrichment_scans_limit: limit('enrichment_scans_limit', defaults.enrichment_scans_per_month),
    csv_exports_used: num('csv_exports_used', 0),
    csv_exports_limit: limit('csv_exports_limit', defaults.csv_exports_per_month),
    period_start:
      typeof src.period_start === 'string'
        ? src.period_start
        : new Date().toISOString().slice(0, 10),
    max_results_per_scan:
      typeof src.max_results_per_scan === 'number' ? src.max_results_per_scan : undefined,
    batch_max_cities:
      typeof src.batch_max_cities === 'number' ? src.batch_max_cities : undefined,
    enrichment_enabled:
      typeof src.enrichment_enabled === 'boolean' ? src.enrichment_enabled : undefined,
    audit_enrichment_enabled:
      typeof src.audit_enrichment_enabled === 'boolean' ? src.audit_enrichment_enabled : undefined,
    csv_export_enabled:
      typeof src.csv_export_enabled === 'boolean' ? src.csv_export_enabled : undefined,
    csv_export_max_rows:
      typeof src.csv_export_max_rows === 'number' ? src.csv_export_max_rows : undefined,
    rank_check_max_pins:
      typeof src.rank_check_max_pins === 'number' ? src.rank_check_max_pins : undefined,
    white_label_enabled:
      typeof src.white_label_enabled === 'boolean' ? src.white_label_enabled : undefined,
  };
}

function normalizeCachedState(state: CachedUserState): CachedUserState {
  if (!state.profile || !state.usage) return state;
  const profile = normalizeProfile(state.profile);
  return {
    ...state,
    profile,
    usage: normalizeUsage(state.usage, profile?.plan ?? 'free'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Local cache
// ─────────────────────────────────────────────────────────────────────────────

export async function getCachedUserState(): Promise<CachedUserState> {
  try {
    const data = await chrome.storage.local.get(USER_STATE_KEY);
    const state = (data[USER_STATE_KEY] as CachedUserState) ?? emptyCachedUserState();
    return normalizeCachedState(state);
  } catch {
    return emptyCachedUserState();
  }
}

export async function setCachedUserState(state: CachedUserState): Promise<void> {
  try {
    await chrome.storage.local.set({ [USER_STATE_KEY]: state });
    chrome.runtime.sendMessage({ type: 'USER_STATE_UPDATE', state }).catch(() => {});
  } catch {
    // Ignore
  }
}

export async function clearCachedUserState(): Promise<void> {
  try {
    await chrome.storage.local.remove(USER_STATE_KEY);
    chrome.runtime.sendMessage({ type: 'USER_STATE_UPDATE', state: emptyCachedUserState() }).catch(() => {});
  } catch {
    // Ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth methods
// ─────────────────────────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<User | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function getCurrentSession(): Promise<Session | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ user: User | null; error: AuthError | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { user: null, error: { message: 'Supabase not configured', status: 500 } as AuthError };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (data.user && !error) {
    await refreshUserState();
    logActivity('sign_in', { method: 'email' });
  }

  return { user: data.user, error };
}

export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ user: User | null; error: AuthError | null; needsConfirmation: boolean }> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      user: null,
      error: { message: 'Supabase not configured', status: 500 } as AuthError,
      needsConfirmation: false,
    };
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  // With "Confirm email" enabled, Supabase creates the user but returns no
  // session until the emailed link is opened.
  const needsConfirmation = Boolean(data.user && !data.session);

  if (data.session && !error) {
    await refreshUserState();
  }

  return { user: data.user, error, needsConfirmation };
}

export async function signOut(): Promise<{ error: AuthError | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { error: null };
  }

  logActivity('sign_out');
  const { error } = await supabase.auth.signOut();
  await clearCachedUserState();
  await syncHistoryScopeWithAuth(null);
  return { error };
}

export async function resetPassword(email: string): Promise<{ error: AuthError | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { error: { message: 'Supabase not configured', status: 500 } as AuthError };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error };
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile & usage
// ─────────────────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<Profile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const user = await getCurrentUser();
  if (!user) return null;

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data;
}

export async function refreshUserState(): Promise<CachedUserState> {
  const supabase = getSupabase();
  if (!supabase) return emptyCachedUserState();

  const user = await getCurrentUser();
  if (!user) {
    await syncHistoryScopeWithAuth(null);
    const emptyState = emptyCachedUserState();
    await setCachedUserState(emptyState);
    return emptyState;
  }

  // Fetch profile — prefer auth email when profile email is still null (e.g. after anonymous upgrade)
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const mergedProfile = profileRow
    ? {
        ...(profileRow as Profile),
        email: (profileRow as Profile).email ?? user.email ?? null,
      }
    : null;
  const profile = normalizeProfile(mergedProfile);

  const accountStatus = profile?.account_status ?? 'active';
  if (accountStatus !== 'active') {
    await signOut();
    return emptyCachedUserState();
  }

  // Fetch current usage via RPC
  const { data: usageRaw } = await supabase.rpc('get_current_usage');
  const usageRecord = usageRaw as Record<string, unknown> | null;
  const plan = normalizePlan(
    profile?.plan ?? (usageRecord?.plan as string | undefined) ?? 'free'
  );

  const state: CachedUserState = {
    profile,
    usage: normalizeUsage(usageRecord, plan),
    cachedAt: new Date().toISOString(),
  };

  await syncHistoryScopeWithAuth(user.id, plan);
  await setCachedUserState(state);
  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quota checking (these call server-side functions that atomically check & consume)
// ─────────────────────────────────────────────────────────────────────────────

export interface QuotaResult {
  allowed: boolean;
  message: string;
}

export interface DeepScanQuotaCheck {
  allowed: boolean;
  message: string;
  /** How many listings may be deep-scraped this run. */
  maxDeepScans: number;
  /** Listings that will remain quick-scan only. */
  skipped: number;
}

/**
 * Check and consume one scan quota. Returns whether the scan is allowed.
 * This calls a server-side function that atomically checks limits and increments usage.
 */
export async function consumeScanQuota(): Promise<QuotaResult> {
  // If Supabase isn't configured, allow everything (local-only mode)
  if (!isSupabaseConfigured()) {
    return { allowed: true, message: 'ok' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { allowed: true, message: 'ok' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { allowed: false, message: 'Sign in to run scans. Open Settings → Account.' };
  }

  try {
    const { data, error } = await supabase.rpc('consume_scan_quota');
    if (error) {
      console.error('[NWF] consume_scan_quota error:', error);
      // On error, allow the scan but log it
      return { allowed: true, message: 'ok' };
    }
    
    // Refresh cached state after quota change
    void refreshUserState();
    
    return data ?? { allowed: true, message: 'ok' };
  } catch (err) {
    console.error('[NWF] consume_scan_quota exception:', err);
    return { allowed: true, message: 'ok' };
  }
}

/**
 * Check how many deep-scan profiles may run this session (does not consume).
 * When quota is partial, returns maxDeepScans below count so the caller can deep-scan
 * only that many and leave the rest as quick-scan data.
 */
export async function checkDeepScanQuota(count: number): Promise<DeepScanQuotaCheck> {
  const result = (
    allowed: boolean,
    message: string,
    maxDeepScans: number,
    skipped: number
  ): DeepScanQuotaCheck => ({ allowed, message, maxDeepScans, skipped });

  if (!isSupabaseConfigured() || count <= 0) {
    return result(true, 'ok', Math.max(0, count), 0);
  }

  const user = await getCurrentUser();
  if (!user) {
    return result(false, 'Sign in to run deep scans. Open Settings → Account.', 0, count);
  }

  let cached = await getCachedUserState();
  if (!cached.usage || Date.now() - Date.parse(cached.cachedAt ?? '') > 60_000) {
    cached = await refreshUserState();
  }

  if (!cached.usage) {
    return result(false, 'Could not load usage. Try again.', 0, count);
  }

  const { deep_scans_used, deep_scans_limit } = cached.usage;

  if (deep_scans_limit < 0) {
    return result(true, 'ok', count, 0);
  }

  const remaining = Math.max(0, deep_scans_limit - deep_scans_used);

  if (remaining === 0) {
    return result(
      false,
      `Deep scan limit reached (${deep_scans_used}/${deep_scans_limit} business profiles this month). Upgrade in Settings → Account.`,
      0,
      count
    );
  }

  if (count <= remaining) {
    return result(true, 'ok', count, 0);
  }

  const skipped = count - remaining;
  const profileWord = remaining === 1 ? 'deep scan' : 'deep scans';
  return result(
    true,
    `You have ${remaining} ${profileWord} left — running on ${remaining}, skipping ${skipped}.`,
    remaining,
    skipped
  );
}

/**
 * Check if one quick scan is allowed (does not consume).
 */
export async function checkQuickScanQuota(): Promise<QuotaResult> {
  if (!isSupabaseConfigured()) {
    return { allowed: true, message: 'ok' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { allowed: false, message: 'Sign in to run quick scans. Open Settings → Account.' };
  }

  let cached = await getCachedUserState();
  if (!cached.usage || Date.now() - Date.parse(cached.cachedAt ?? '') > 60_000) {
    cached = await refreshUserState();
  }

  if (!cached.usage) {
    return { allowed: false, message: 'Could not load usage. Try again.' };
  }

  const { quick_scans_used = 0, quick_scans_limit = PLAN_LIMITS[normalizePlan(cached.profile?.plan)].quick_scans_per_month } =
    cached.usage;

  if (quick_scans_limit < 0) {
    return { allowed: true, message: 'ok' };
  }

  if (quick_scans_used >= quick_scans_limit) {
    return {
      allowed: false,
      message: `Quick scan limit reached (${quick_scans_used}/${quick_scans_limit} this month). Upgrade in Settings → Account for unlimited quick scans.`,
    };
  }

  return { allowed: true, message: 'ok' };
}

/**
 * Check and consume one quick scan quota.
 */
export async function consumeQuickScanQuota(): Promise<QuotaResult> {
  if (!isSupabaseConfigured()) {
    return { allowed: true, message: 'ok' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { allowed: true, message: 'ok' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { allowed: false, message: 'Sign in to run quick scans.' };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('consume_quick_scan_quota');
    if (error) {
      console.error('[NWF] consume_quick_scan_quota error:', error);
      return { allowed: false, message: 'Could not verify quick scan quota. Try again.' };
    }

    void refreshUserState();
    return data ?? { allowed: true, message: 'ok' };
  } catch (err) {
    console.error('[NWF] consume_quick_scan_quota exception:', err);
    return { allowed: false, message: 'Could not verify quick scan quota. Try again.' };
  }
}

/**
 * Check and consume deep scan quota for N businesses.
 */
export async function consumeDeepScanQuota(count: number): Promise<QuotaResult> {
  if (!isSupabaseConfigured() || count <= 0) {
    return { allowed: true, message: 'ok' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { allowed: true, message: 'ok' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { allowed: false, message: 'Sign in to run deep scans.' };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('consume_deep_scan_quota', { count });
    if (error) {
      console.error('[NWF] consume_deep_scan_quota error:', error);
      return { allowed: false, message: 'Could not verify deep scan quota. Try again.' };
    }

    void refreshUserState();
    return data ?? { allowed: true, message: 'ok' };
  } catch (err) {
    console.error('[NWF] consume_deep_scan_quota exception:', err);
    return { allowed: false, message: 'Could not verify deep scan quota. Try again.' };
  }
}

/**
 * Check and consume one audit quota.
 */
export async function consumeAuditQuota(): Promise<QuotaResult> {
  if (!isSupabaseConfigured()) {
    return { allowed: true, message: 'ok' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { allowed: true, message: 'ok' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { allowed: false, message: 'Sign in to run GBP audits.' };
  }

  try {
    const { data, error } = await supabase.rpc('consume_audit_quota');
    if (error) {
      console.error('[NWF] consume_audit_quota error:', error);
      return { allowed: true, message: 'ok' };
    }
    
    void refreshUserState();
    return data ?? { allowed: true, message: 'ok' };
  } catch (err) {
    console.error('[NWF] consume_audit_quota exception:', err);
    return { allowed: true, message: 'ok' };
  }
}

/**
 * Reserve one lead scan this month that may run contact enrichment (Free: 1 of 3 scans).
 */
export async function consumeEnrichmentScanQuota(): Promise<QuotaResult> {
  if (!isSupabaseConfigured()) {
    return { allowed: true, message: 'ok' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { allowed: true, message: 'ok' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { allowed: false, message: 'Sign in to run enrichment.' };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('consume_enrichment_scan_quota');
    if (error) {
      console.error('[NWF] consume_enrichment_scan_quota error:', error);
      return { allowed: false, message: 'Could not verify enrichment quota. Try again.' };
    }

    void refreshUserState();
    return data ?? { allowed: true, message: 'ok' };
  } catch (err) {
    console.error('[NWF] consume_enrichment_scan_quota exception:', err);
    return { allowed: false, message: 'Could not verify enrichment quota. Try again.' };
  }
}

/**
 * Check and consume one CSV export (Free: 1/month).
 */
export async function consumeCsvExportQuota(): Promise<QuotaResult> {
  if (!isSupabaseConfigured()) {
    return { allowed: true, message: 'ok' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { allowed: true, message: 'ok' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { allowed: false, message: 'Sign in to export CSV.' };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('consume_csv_export_quota');
    if (error) {
      console.error('[NWF] consume_csv_export_quota error:', error);
      return { allowed: false, message: 'Could not verify CSV export quota. Try again.' };
    }

    void refreshUserState();
    return data ?? { allowed: true, message: 'ok' };
  } catch (err) {
    console.error('[NWF] consume_csv_export_quota exception:', err);
    return { allowed: false, message: 'Could not verify CSV export quota. Try again.' };
  }
}

/**
 * Check if user has remaining quota without consuming.
 * Uses cached state for speed, falls back to fresh fetch.
 */
export async function checkQuotaAvailable(
  type: 'scan' | 'quick_scan' | 'deep_scan' | 'audit'
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return true;
  }

  let cached = await getCachedUserState();
  
  // If cache is stale (> 5 min), refresh
  if (cached.cachedAt && Date.now() - Date.parse(cached.cachedAt) > 5 * 60 * 1000) {
    cached = await refreshUserState();
  }

  if (!cached.profile || !cached.usage) {
    return false;
  }

  const { usage } = cached;
  
  switch (type) {
    case 'scan':
      return usage.scans_limit < 0 || usage.scans_used < usage.scans_limit;
    case 'quick_scan':
      return (
        usage.quick_scans_limit < 0 ||
        usage.quick_scans_used < usage.quick_scans_limit
      );
    case 'deep_scan':
      return usage.deep_scans_limit < 0 || usage.deep_scans_used < usage.deep_scans_limit;
    case 'audit':
      return usage.audits_limit < 0 || usage.audits_used < usage.audits_limit;
    default:
      return true;
  }
}

/**
 * Ensure user has an anonymous account for free tier usage tracking.
 * Called on extension install. Returns true if anonymous account was created.
 */
export async function ensureAnonymousUser(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) {
    console.log('[Anonymous Auth] Supabase not configured');
    return false;
  }

  try {
    // Check if user already has a session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      console.log('[Anonymous Auth] User already has session:', session.user.id);
      return false;
    }

    // Create anonymous user
    console.log('[Anonymous Auth] Creating anonymous user...');
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      console.error('[Anonymous Auth] Error creating anonymous user:', error);
      return false;
    }

    if (data.user) {
      console.log('[Anonymous Auth] Anonymous user created:', data.user.id);
      
      // Profile will be auto-created by database trigger or RLS policy
      // Refresh user state to populate cache and trigger profile creation
      await refreshUserState();
      
      console.log('[Anonymous Auth] User state refreshed for anonymous user');
      
      return true;
    }

    return false;
  } catch (err) {
    console.error('[Anonymous Auth] Exception:', err);
    return false;
  }
}
