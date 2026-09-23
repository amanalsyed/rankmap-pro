/**
 * Database types for Supabase.
 * These should match the schema defined in supabase/schema.sql
 */

export type Plan = 'free' | 'pro' | 'lifetime';

export type AccountStatus = 'active' | 'suspended' | 'deleted';

export interface Profile {
  id: string;
  email: string | null;
  plan: Plan;
  plan_expires_at: string | null;
  lifetime_purchased_at?: string | null;
  license_key?: string | null;
  license_activated_at?: string | null;
  is_super_admin?: boolean;
  account_status?: AccountStatus;
  suspended_at?: string | null;
  deleted_at?: string | null;
  suspended_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageCounter {
  id: string;
  user_id: string;
  period_start: string;
  scans_used: number;
  quick_scans_used: number;
  businesses_deep_scanned: number;
  audits_used: number;
  enrichment_scans_used: number;
  csv_exports_used: number;
  created_at: string;
  updated_at: string;
}

export interface PlanLimits {
  scans_per_month: number;
  quick_scans_per_month: number;
  deep_scans_per_month: number;
  audits_per_month: number;
  enrichment_scans_per_month: number;
  csv_exports_per_month: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    scans_per_month: 2,
    quick_scans_per_month: 3,
    deep_scans_per_month: 3,
    audits_per_month: 3,
    enrichment_scans_per_month: 1,
    csv_exports_per_month: 1,
  },
  pro: {
    scans_per_month: 200,
    quick_scans_per_month: -1,
    deep_scans_per_month: 1000,
    audits_per_month: 300,
    enrichment_scans_per_month: -1,
    csv_exports_per_month: -1,
  },
  lifetime: {
    scans_per_month: -1,
    quick_scans_per_month: -1,
    deep_scans_per_month: -1,
    audits_per_month: -1,
    enrichment_scans_per_month: -1,
    csv_exports_per_month: -1,
  },
};

/** Supabase Database type definition for typed client. */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
      };
      usage_counters: {
        Row: UsageCounter;
        Insert: Omit<UsageCounter, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<UsageCounter, 'id' | 'user_id' | 'created_at'>>;
      };
    };
    Functions: {
      consume_scan_quota: {
        Args: Record<string, never>;
        Returns: { allowed: boolean; message: string };
      };
      consume_deep_scan_quota: {
        Args: { count?: number };
        Returns: { allowed: boolean; message: string };
      };
      consume_quick_scan_quota: {
        Args: Record<string, never>;
        Returns: { allowed: boolean; message: string };
      };
      consume_audit_quota: {
        Args: Record<string, never>;
        Returns: { allowed: boolean; message: string };
      };
      get_current_usage: {
        Args: Record<string, never>;
        Returns: {
          plan: Plan;
          scans_used: number;
          scans_limit: number;
          quick_scans_used: number;
          quick_scans_limit: number;
          deep_scans_used: number;
          deep_scans_limit: number;
          audits_used: number;
          audits_limit: number;
          period_start: string;
        };
      };
    };
  };
}

/** User state cached locally for offline/quick access. */
export interface CachedUserState {
  profile: Profile | null;
  usage: {
    scans_used: number;
    scans_limit: number;
    quick_scans_used: number;
    quick_scans_limit: number;
    deep_scans_used: number;
    deep_scans_limit: number;
    audits_used: number;
    audits_limit: number;
    enrichment_scans_used?: number;
    enrichment_scans_limit?: number;
    csv_exports_used?: number;
    csv_exports_limit?: number;
    period_start: string;
    max_results_per_scan?: number;
    batch_max_cities?: number;
    enrichment_enabled?: boolean;
    audit_enrichment_enabled?: boolean;
    csv_export_enabled?: boolean;
    csv_export_max_rows?: number;
    rank_check_max_pins?: number;
    white_label_enabled?: boolean;
  } | null;
  cachedAt: string;
}

export function emptyCachedUserState(): CachedUserState {
  return {
    profile: null,
    usage: null,
    cachedAt: '',
  };
}
