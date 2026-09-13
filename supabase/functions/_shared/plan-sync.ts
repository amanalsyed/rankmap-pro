import { createAdminClient } from './supabase-admin.ts';
import {
  planRank,
  polarApiBase,
  polarHeaders,
  productPlanMap,
  readPolarEnvironment,
  resolveLifetimeProductId,
} from './polar.ts';

type Plan = 'free' | 'pro' | 'lifetime';

export interface PlanSyncOpts {
  subscriptionId?: string | null;
  customerId?: string | null;
  expiresAt?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function extractProductIdFromData(data: Record<string, unknown> | null): string | null {
  if (!data) return null;

  const product = asRecord(data.product);
  const direct =
    readString(product, 'id') ??
    readString(data, 'product_id', 'productId');

  if (direct) return direct;

  const products = data.products;
  if (Array.isArray(products) && products.length > 0) {
    const first = products[0];
    if (typeof first === 'string') return first;
    return readString(asRecord(first), 'id', 'product_id', 'productId');
  }

  const items = data.items;
  if (Array.isArray(items) && items.length > 0) {
    const firstItem = asRecord(items[0]);
    if (firstItem) {
      const itemProduct = asRecord(firstItem.product);
      return (
        readString(itemProduct, 'id') ??
        readString(firstItem, 'product_id', 'productId')
      );
    }
  }

  return null;
}

export function extractCustomerIdFromData(data: Record<string, unknown> | null): string | null {
  if (!data) return null;

  const customer = asRecord(data.customer);
  return (
    readString(customer, 'id') ??
    readString(data, 'customer_id', 'customerId') ??
    null
  );
}

export function extractSubscriptionIdFromData(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  return readString(data, 'id', 'subscription_id', 'subscriptionId');
}

export function extractPeriodEndFromData(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  return readString(
    data,
    'current_period_end',
    'currentPeriodEnd',
    'ends_at',
    'endsAt'
  );
}

export function extractExternalUserIdFromData(data: Record<string, unknown> | null): string | null {
  if (!data) return null;

  const customer = asRecord(data.customer);
  const metadata = asRecord(data.metadata);

  return (
    readString(data, 'external_id', 'externalId') ??
    readString(customer, 'external_id', 'externalId') ??
    readString(data, 'external_customer_id', 'externalCustomerId') ??
    readString(metadata, 'supabase_user_id') ??
    null
  );
}

export function isActiveSubscriptionData(data: Record<string, unknown> | null): boolean {
  const status = readString(data, 'status')?.toLowerCase();
  return status === 'active' || status === 'trialing';
}

async function fetchPolarJson(path: string): Promise<Record<string, unknown> | null> {
  const accessToken = Deno.env.get('POLAR_ACCESS_TOKEN');
  if (!accessToken) return null;

  const env = readPolarEnvironment();
  const res = await fetch(`${polarApiBase(env)}${path}`, {
    headers: polarHeaders(accessToken),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('[plan-sync] Polar API error', path, res.status, detail);
    return null;
  }

  const payload = await res.json();
  return asRecord(payload);
}

async function fetchExistingPlan(userId: string): Promise<Plan> {
  const admin = createAdminClient();
  const { data } = await admin.from('profiles').select('plan').eq('id', userId).maybeSingle();
  const plan = data?.plan;
  if (plan === 'starter') return 'pro';
  if (plan === 'pro' || plan === 'lifetime' || plan === 'free') {
    return plan;
  }
  return 'free';
}

export async function fetchPolarCustomerExternalId(customerId: string): Promise<string | null> {
  const customer = await fetchPolarJson(`/v1/customers/${customerId}`);
  return extractExternalUserIdFromData(customer);
}

export async function resolveExternalUserId(
  data: Record<string, unknown> | null
): Promise<string | null> {
  const direct = extractExternalUserIdFromData(data);
  if (direct) return direct;

  const customerId = extractCustomerIdFromData(data);
  if (!customerId) return null;

  return fetchPolarCustomerExternalId(customerId);
}

export async function setUserPlan(userId: string, plan: Plan, opts: PlanSyncOpts = {}) {
  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    plan,
    plan_expires_at: plan === 'free' || plan === 'lifetime' ? null : opts.expiresAt ?? null,
    polar_subscription_id:
      plan === 'free' || plan === 'lifetime' ? null : opts.subscriptionId ?? null,
    polar_customer_id: opts.customerId ?? null,
    updated_at: new Date().toISOString(),
  };

  if (plan === 'lifetime') {
    update.lifetime_purchased_at = new Date().toISOString();
  }

  const { error } = await admin.from('profiles').update(update).eq('id', userId);
  if (error) {
    console.error('[plan-sync] profile update failed:', error);
    throw error;
  }
}

export async function syncPlanFromExternalUserId(externalUserId: string): Promise<boolean> {
  const state = await fetchPolarJson(
    `/v1/customers/external/${encodeURIComponent(externalUserId)}/state`
  );
  if (!state) return false;
  await syncPlanFromCustomerState(state);
  return true;
}

export async function syncPlanFromPolarCustomerId(customerId: string): Promise<boolean> {
  const state = await fetchPolarJson(`/v1/customers/${encodeURIComponent(customerId)}/state`);
  if (!state) return false;
  await syncPlanFromCustomerState(state);
  return true;
}

export async function syncPlanFromSubscriptionData(data: Record<string, unknown> | null) {
  if (!data) return;

  const userId = await resolveExternalUserId(data);
  if (!userId) {
    console.warn('[plan-sync] Could not resolve Supabase user id from subscription payload');
    return;
  }

  const existingPlan = await fetchExistingPlan(userId);
  if (existingPlan === 'lifetime') {
    return;
  }

  const productId = extractProductIdFromData(data);
  const plan = productId ? productPlanMap()[productId] : undefined;

  if (!isActiveSubscriptionData(data) || !plan || plan === 'lifetime') {
    if (!plan && isActiveSubscriptionData(data)) {
      console.warn('[plan-sync] Unknown subscription product, syncing customer state', productId);
      await syncPlanFromExternalUserId(userId);
      return;
    }
    if (existingPlan === 'lifetime') {
      return;
    }
    await setUserPlan(userId, 'free', {
      subscriptionId: null,
      customerId: extractCustomerIdFromData(data),
      expiresAt: null,
    });
    return;
  }

  if (planRank(existingPlan) > planRank(plan)) {
    return;
  }

  await setUserPlan(userId, plan, {
    subscriptionId: extractSubscriptionIdFromData(data),
    customerId: extractCustomerIdFromData(data),
    expiresAt: extractPeriodEndFromData(data),
  });
}

export async function syncPlanFromCustomerState(data: Record<string, unknown> | null) {
  if (!data) return;

  const nestedCustomer = asRecord(data.customer);
  const customerRecord = nestedCustomer ?? data;

  const userId =
    extractExternalUserIdFromData(data) ??
    extractExternalUserIdFromData(customerRecord) ??
    (await resolveExternalUserId(customerRecord));

  if (!userId) {
    console.warn('[plan-sync] Could not resolve Supabase user id from customer state');
    return;
  }

  const existingPlan = await fetchExistingPlan(userId);
  const existingRank = planRank(existingPlan);

  const subscriptions = Array.isArray(data.active_subscriptions)
    ? data.active_subscriptions
    : Array.isArray(data.subscriptions)
      ? data.subscriptions
      : [];

  const planMap = productPlanMap();
  let bestPlan: Plan | null = null;
  let bestRank = -1;
  let subscriptionId: string | null = null;
  let customerId =
    readString(customerRecord, 'id') ??
    extractCustomerIdFromData(customerRecord) ??
    extractCustomerIdFromData(data);
  let expiresAt: string | null = null;

  for (const entry of subscriptions) {
    const sub = asRecord(entry);
    if (!sub || !isActiveSubscriptionData(sub)) continue;

    const productId = extractProductIdFromData(sub);
    const plan = productId ? planMap[productId] : undefined;
    if (!plan || plan === 'lifetime') {
      console.warn('[plan-sync] Unknown or lifetime product in customer state', productId);
      continue;
    }

    const rank = planRank(plan);
    if (rank > bestRank) {
      bestRank = rank;
      bestPlan = plan;
      subscriptionId = extractSubscriptionIdFromData(sub);
      customerId = extractCustomerIdFromData(sub) ?? customerId;
      expiresAt = extractPeriodEndFromData(sub);
    }
  }

  if (existingRank > bestRank) {
    if (existingPlan === 'lifetime') {
      await setUserPlan(userId, 'lifetime', { subscriptionId: null, customerId, expiresAt: null });
    }
    return;
  }

  if (!bestPlan) {
    if (existingPlan === 'lifetime') {
      await setUserPlan(userId, 'lifetime', { subscriptionId: null, customerId, expiresAt: null });
      return;
    }
    await setUserPlan(userId, 'free', { subscriptionId: null, customerId, expiresAt: null });
    return;
  }

  await setUserPlan(userId, bestPlan, { subscriptionId, customerId, expiresAt });
}

export async function syncPlanFromOrderData(data: Record<string, unknown> | null): Promise<boolean> {
  if (!data) return false;

  const lifetimeId = resolveLifetimeProductId();
  const productId = extractProductIdFromData(data);
  if (!lifetimeId || !productId || productId !== lifetimeId) {
    return false;
  }

  const userId = await resolveExternalUserId(data);
  if (!userId) {
    console.warn('[plan-sync] Lifetime order missing external customer id');
    return false;
  }

  await setUserPlan(userId, 'lifetime', {
    customerId: extractCustomerIdFromData(data),
    subscriptionId: null,
    expiresAt: null,
  });
  return true;
}

export async function syncPlanFromBillingEvent(data: Record<string, unknown> | null): Promise<boolean> {
  if (!data) return false;

  const handledLifetime = await syncPlanFromOrderData(data);
  if (handledLifetime) return true;

  const userId = await resolveExternalUserId(data);
  if (userId) {
    return syncPlanFromExternalUserId(userId);
  }

  const customerId = extractCustomerIdFromData(data);
  if (customerId) {
    return syncPlanFromPolarCustomerId(customerId);
  }

  return false;
}

export async function syncPlanFromCheckoutData(data: Record<string, unknown> | null): Promise<boolean> {
  if (!data) return false;

  const userId = await resolveExternalUserId(data);
  if (!userId) {
    console.warn('[plan-sync] Checkout payload missing external customer id');
    return false;
  }

  const status = readString(data, 'status')?.toLowerCase();
  if (status && status !== 'succeeded' && status !== 'confirmed' && status !== 'completed') {
    return false;
  }

  const productId = extractProductIdFromData(data);
  const plan = productId ? productPlanMap()[productId] : undefined;
  if (!plan) {
    console.warn('[plan-sync] Unknown checkout product', productId);
    return false;
  }

  const existingPlan = await fetchExistingPlan(userId);
  if (planRank(existingPlan) > planRank(plan)) {
    return true;
  }

  await setUserPlan(userId, plan, {
    customerId: extractCustomerIdFromData(data),
    subscriptionId: null,
    expiresAt: null,
  });
  return true;
}

export async function syncPlanFromCheckoutId(checkoutId: string): Promise<boolean> {
  const checkout = await fetchPolarJson(`/v1/checkouts/${checkoutId}`);
  if (!checkout) return false;
  return syncPlanFromCheckoutData(checkout);
}
