import { getCachedUserState } from './auth';
import { capabilitiesFromUsage } from './plan-capabilities';
import type { Plan } from './types';
import type { PlanCapabilities } from './plan-capabilities';

export async function getActivePlanContext(): Promise<{
  signedIn: boolean;
  plan: Plan;
  capabilities: PlanCapabilities;
}> {
  const cached = await getCachedUserState();
  const plan = cached.profile?.plan ?? 'free';
  const capabilities = capabilitiesFromUsage(
    cached.usage as Record<string, unknown> | null,
    plan
  );
  return {
    signedIn: Boolean(cached.profile),
    plan,
    capabilities,
  };
}

export function clampScanCount(requested: number, maxResults: number): number {
  if (maxResults <= 0) return requested;
  return Math.min(requested, maxResults);
}
