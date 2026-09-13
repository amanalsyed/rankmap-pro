/**
 * Supabase integration entry point.
 */

export { getSupabase, isSupabaseConfigured } from './client';
export { supabase } from './client';
export { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_CONFIGURED } from './config';
export {
  getCurrentUser,
  getCurrentSession,
  getProfile,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  resetPassword,
  getCachedUserState,
  setCachedUserState,
  clearCachedUserState,
  refreshUserState,
  consumeScanQuota,
  consumeDeepScanQuota,
  checkDeepScanQuota,
  type DeepScanQuotaCheck,
  consumeQuickScanQuota,
  checkQuickScanQuota,
  consumeAuditQuota,
  consumeEnrichmentScanQuota,
  consumeCsvExportQuota,
  checkQuotaAvailable,
} from './auth';
export { signInWithGoogle, isGoogleAuthConfigured, GOOGLE_CLIENT_ID } from './google-auth';
export { submitFeedback } from './feedback';
export type { FeedbackCategory, FeedbackPayload } from './feedback';
export {
  PLAN_CAPABILITIES,
  capabilitiesFromUsage,
  planRank,
  upgradeMessage,
} from './plan-capabilities';
export type { PlanCapabilities } from './plan-capabilities';
export type {
  Plan,
  Profile,
  UsageCounter,
  PlanLimits,
  CachedUserState,
  Database,
} from './types';
export { PLAN_LIMITS, emptyCachedUserState } from './types';
