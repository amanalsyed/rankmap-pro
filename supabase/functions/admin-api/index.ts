import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { logAdminAction, requireSuperAdmin } from '../_shared/admin-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function currentPeriodStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function startOfTodayUtc() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function bucketByDay(rows: { created_at: string }[], days = 30) {
  const buckets: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = 0;
  }
  for (const row of rows) {
    const key = row.created_at.slice(0, 10);
    if (key in buckets) buckets[key]++;
  }
  return Object.entries(buckets).map(([date, count]) => ({ date, count }));
}

function escapeCsv(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const ctx = await requireSuperAdmin(req);
    if (ctx instanceof Response) return ctx;

    const body = await req.json();
    const action = String(body.action ?? '');
    const admin = createAdminClient();

    switch (action) {
      case 'stats': {
        const todayStart = startOfTodayUtc();
        const period = currentPeriodStart();
        const thirtyDaysAgo = daysAgoIso(30);

        const [
          { count: totalUsers },
          { count: activeUsers },
          { count: suspendedUsers },
          { count: lifetimeUsers },
          { count: freeUsers },
          { count: activeLicenses },
          { count: feedbackCount },
          { data: todayActivity },
          { data: recentProfiles },
          { data: recentActivity },
          { data: recentFeedback },
          { data: recentRevoked },
        ] = await Promise.all([
          admin.from('profiles').select('*', { count: 'exact', head: true }),
          admin.from('profiles').select('*', { count: 'exact', head: true }).eq('account_status', 'active'),
          admin.from('profiles').select('*', { count: 'exact', head: true }).eq('account_status', 'suspended'),
          admin.from('profiles').select('*', { count: 'exact', head: true }).eq('plan', 'lifetime'),
          admin.from('profiles').select('*', { count: 'exact', head: true }).eq('plan', 'free'),
          admin.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active'),
          admin.from('feedback').select('*', { count: 'exact', head: true }),
          admin.from('activity_events').select('user_id').gte('created_at', todayStart).limit(5000),
          admin.from('profiles').select('created_at').gte('created_at', thirtyDaysAgo),
          admin.from('activity_events').select('created_at').gte('created_at', thirtyDaysAgo),
          admin.from('feedback').select('id, category, created_at').gte('created_at', daysAgoIso(1)),
          admin.from('licenses').select('id, created_at').eq('status', 'revoked').gte('updated_at', daysAgoIso(7)),
        ]);

        const { data: usageRows } = await admin
          .from('usage_counters')
          .select('scans_used, audits_used, quick_scans_used, businesses_deep_scanned')
          .eq('period_start', period);

        const usage = (usageRows ?? []).reduce(
          (acc, row) => ({
            scans: acc.scans + (row.scans_used ?? 0),
            audits: acc.audits + (row.audits_used ?? 0),
            quick_scans: acc.quick_scans + (row.quick_scans_used ?? 0),
            deep_scans: acc.deep_scans + (row.businesses_deep_scanned ?? 0),
          }),
          { scans: 0, audits: 0, quick_scans: 0, deep_scans: 0 }
        );

        const activeToday = new Set(
          (todayActivity ?? []).map((e) => e.user_id).filter(Boolean)
        ).size;

        const signupsByDay = bucketByDay(recentProfiles ?? []);
        const activityByDay = bucketByDay(recentActivity ?? []);

        const alerts: { level: string; message: string }[] = [];
        const bugFeedback = (recentFeedback ?? []).filter((f) => f.category === 'bug');
        if (bugFeedback.length > 0) {
          alerts.push({ level: 'warning', message: `${bugFeedback.length} bug report(s) in the last 24 hours` });
        }
        if ((suspendedUsers ?? 0) > 0) {
          alerts.push({ level: 'info', message: `${suspendedUsers} suspended account(s)` });
        }
        if ((recentRevoked ?? []).length > 0) {
          alerts.push({ level: 'warning', message: `${recentRevoked!.length} license(s) revoked this week` });
        }
        const signupsToday = signupsByDay[signupsByDay.length - 1]?.count ?? 0;
        if (signupsToday > 0) {
          alerts.push({ level: 'info', message: `${signupsToday} new signup(s) today` });
        }

        return json({
          totalUsers: totalUsers ?? 0,
          activeUsers: activeUsers ?? 0,
          suspendedUsers: suspendedUsers ?? 0,
          lifetimeUsers: lifetimeUsers ?? 0,
          freeUsers: freeUsers ?? 0,
          activeLicenses: activeLicenses ?? 0,
          feedbackCount: feedbackCount ?? 0,
          activeToday,
          usageThisMonth: usage,
          signupsByDay,
          activityByDay,
          alerts,
        });
      }

      case 'list_users': {
        const page = Math.max(1, Number(body.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(body.limit) || 25));
        const offset = (page - 1) * limit;
        const search = String(body.search ?? '').trim();
        const period = currentPeriodStart();

        let query = admin
          .from('profiles')
          .select(
            'id, email, plan, account_status, is_super_admin, license_key, created_at, updated_at, suspended_at, deleted_at, suspended_reason',
            { count: 'exact' }
          )
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (search) {
          if (/^[0-9a-f-]{36}$/i.test(search)) {
            query = query.eq('id', search);
          } else if (search.length >= 8 && !search.includes('@')) {
            query = query.ilike('license_key', `%${search}%`);
          } else {
            query = query.or(`email.ilike.%${search}%`);
          }
        }

        const { data, count, error } = await query;
        if (error) return json({ error: error.message }, 400);

        const userIds = (data ?? []).map((u) => u.id);
        let usageMap: Record<string, Record<string, number>> = {};

        if (userIds.length > 0) {
          const { data: usageRows } = await admin
            .from('usage_counters')
            .select('user_id, scans_used, audits_used, quick_scans_used, businesses_deep_scanned')
            .in('user_id', userIds)
            .eq('period_start', period);

          for (const row of usageRows ?? []) {
            usageMap[row.user_id] = {
              scans_used: row.scans_used ?? 0,
              audits_used: row.audits_used ?? 0,
              quick_scans_used: row.quick_scans_used ?? 0,
              deep_scans_used: row.businesses_deep_scanned ?? 0,
            };
          }
        }

        const users = (data ?? []).map((u) => ({
          ...u,
          usage: usageMap[u.id] ?? {
            scans_used: 0,
            audits_used: 0,
            quick_scans_used: 0,
            deep_scans_used: 0,
          },
        }));

        return json({ users, total: count ?? 0, page, limit });
      }

      case 'get_user': {
        const userId = String(body.user_id ?? '');
        if (!userId) return json({ error: 'user_id required' }, 400);

        const [{ data: profile }, { data: usage }, { data: licenses }, { data: events }] =
          await Promise.all([
            admin.from('profiles').select('*').eq('id', userId).single(),
            admin
              .from('usage_counters')
              .select('*')
              .eq('user_id', userId)
              .order('period_start', { ascending: false })
              .limit(6),
            admin.from('licenses').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
            admin
              .from('activity_events')
              .select('*')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(20),
          ]);

        if (!profile) return json({ error: 'User not found' }, 404);
        return json({ profile, usage: usage ?? [], licenses: licenses ?? [], recent_activity: events ?? [] });
      }

      case 'suspend_user': {
        const userId = String(body.user_id ?? '');
        const reason = String(body.reason ?? 'Suspended by admin').slice(0, 500);
        if (!userId) return json({ error: 'user_id required' }, 400);
        if (userId === ctx.adminId) return json({ error: 'Cannot suspend yourself' }, 400);

        const { error } = await admin
          .from('profiles')
          .update({
            account_status: 'suspended',
            suspended_at: new Date().toISOString(),
            suspended_reason: reason,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (error) return json({ error: error.message }, 400);
        await logAdminAction(ctx.adminId, 'suspend_user', userId, { reason });
        return json({ success: true });
      }

      case 'restore_user': {
        const userId = String(body.user_id ?? '');
        if (!userId) return json({ error: 'user_id required' }, 400);

        const { error } = await admin
          .from('profiles')
          .update({
            account_status: 'active',
            suspended_at: null,
            deleted_at: null,
            suspended_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (error) return json({ error: error.message }, 400);

        await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
        await logAdminAction(ctx.adminId, 'restore_user', userId, {});
        return json({ success: true });
      }

      case 'delete_user': {
        const userId = String(body.user_id ?? '');
        if (!userId) return json({ error: 'user_id required' }, 400);
        if (userId === ctx.adminId) return json({ error: 'Cannot delete yourself' }, 400);

        const { error } = await admin
          .from('profiles')
          .update({
            account_status: 'deleted',
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (error) return json({ error: error.message }, 400);

        await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
        await logAdminAction(ctx.adminId, 'delete_user', userId, { soft: true });
        return json({ success: true });
      }

      case 'hard_delete_user': {
        const userId = String(body.user_id ?? '');
        if (!userId) return json({ error: 'user_id required' }, 400);
        if (userId === ctx.adminId) return json({ error: 'Cannot delete yourself' }, 400);

        const { error: authErr } = await admin.auth.admin.deleteUser(userId);
        if (authErr) return json({ error: authErr.message }, 400);

        await logAdminAction(ctx.adminId, 'hard_delete_user', userId, {});
        return json({ success: true });
      }

      case 'change_plan': {
        const userId = String(body.user_id ?? '');
        const plan = String(body.plan ?? '');
        if (!userId || !['free', 'pro', 'lifetime'].includes(plan)) {
          return json({ error: 'user_id and valid plan required' }, 400);
        }

        const updates: Record<string, unknown> = {
          plan,
          updated_at: new Date().toISOString(),
        };
        if (plan === 'lifetime') {
          updates.plan_expires_at = null;
          updates.lifetime_purchased_at = new Date().toISOString();
        } else if (plan === 'free') {
          updates.plan_expires_at = null;
        }

        const { error } = await admin.from('profiles').update(updates).eq('id', userId);
        if (error) return json({ error: error.message }, 400);
        await logAdminAction(ctx.adminId, 'change_plan', userId, { plan });
        return json({ success: true });
      }

      case 'reset_usage': {
        const userId = String(body.user_id ?? '');
        if (!userId) return json({ error: 'user_id required' }, 400);

        const period = currentPeriodStart();
        const { error } = await admin
          .from('usage_counters')
          .update({
            scans_used: 0,
            quick_scans_used: 0,
            businesses_deep_scanned: 0,
            audits_used: 0,
            enrichment_scans_used: 0,
            csv_exports_used: 0,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('period_start', period);

        if (error) return json({ error: error.message }, 400);
        await logAdminAction(ctx.adminId, 'reset_usage', userId, { period });
        return json({ success: true });
      }

      case 'list_licenses': {
        const page = Math.max(1, Number(body.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(body.limit) || 25));
        const offset = (page - 1) * limit;
        const search = String(body.search ?? '').trim();

        let query = admin
          .from('licenses')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (search) {
          query = query.or(`email.ilike.%${search}%,license_key.ilike.%${search}%`);
        }

        const { data, count, error } = await query;
        if (error) return json({ error: error.message }, 400);
        return json({ licenses: data ?? [], total: count ?? 0, page, limit });
      }

      case 'revoke_license': {
        const licenseId = String(body.license_id ?? '');
        if (!licenseId) return json({ error: 'license_id required' }, 400);

        const { data: license, error: fetchErr } = await admin
          .from('licenses')
          .select('*')
          .eq('id', licenseId)
          .single();

        if (fetchErr || !license) return json({ error: 'License not found' }, 404);

        const { error } = await admin
          .from('licenses')
          .update({ status: 'revoked', updated_at: new Date().toISOString() })
          .eq('id', licenseId);

        if (error) return json({ error: error.message }, 400);

        if (license.user_id) {
          await admin
            .from('profiles')
            .update({
              plan: 'free',
              license_key: null,
              license_activated_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', license.user_id);
        }

        await logAdminAction(ctx.adminId, 'revoke_license', license.user_id, {
          license_id: licenseId,
          license_key: license.license_key,
        });
        return json({ success: true });
      }

      case 'reassign_license': {
        const licenseId = String(body.license_id ?? '');
        const userId = String(body.user_id ?? '');
        if (!licenseId || !userId) return json({ error: 'license_id and user_id required' }, 400);

        const { data: license, error: fetchErr } = await admin
          .from('licenses')
          .select('*')
          .eq('id', licenseId)
          .single();

        if (fetchErr || !license) return json({ error: 'License not found' }, 404);
        if (license.status !== 'active') return json({ error: 'License is not active' }, 400);

        if (license.user_id && license.user_id !== userId) {
          await admin
            .from('profiles')
            .update({
              plan: 'free',
              license_key: null,
              license_activated_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', license.user_id);
        }

        const now = new Date().toISOString();
        await admin
          .from('licenses')
          .update({ user_id: userId, activated_at: license.activated_at ?? now, updated_at: now })
          .eq('id', licenseId);

        await admin
          .from('profiles')
          .update({
            plan: 'lifetime',
            license_key: license.license_key,
            license_activated_at: license.activated_at ?? now,
            lifetime_purchased_at: now,
            plan_expires_at: null,
            email: license.email,
            updated_at: now,
          })
          .eq('id', userId);

        await logAdminAction(ctx.adminId, 'reassign_license', userId, {
          license_id: licenseId,
          license_key: license.license_key,
          previous_user_id: license.user_id,
        });
        return json({ success: true });
      }

      case 'generate_impersonation_link': {
        const userId = String(body.user_id ?? '');
        if (!userId) return json({ error: 'user_id required' }, 400);
        if (userId === ctx.adminId) return json({ error: 'Cannot impersonate yourself' }, 400);

        const { data: profile } = await admin.from('profiles').select('email').eq('id', userId).single();
        if (!profile?.email) return json({ error: 'User has no email — cannot generate login link' }, 400);

        const { data, error } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email: profile.email,
        });

        if (error || !data?.properties?.action_link) {
          return json({ error: error?.message ?? 'Could not generate link' }, 400);
        }

        await logAdminAction(ctx.adminId, 'generate_impersonation_link', userId, {});
        return json({ link: data.properties.action_link, email: profile.email });
      }

      case 'list_activity': {
        const page = Math.max(1, Number(body.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(body.limit) || 50));
        const offset = (page - 1) * limit;
        const userId = body.user_id ? String(body.user_id) : null;
        const eventType = body.event_type ? String(body.event_type) : null;
        const dateFrom = body.date_from ? String(body.date_from) : null;
        const dateTo = body.date_to ? String(body.date_to) : null;

        let query = admin
          .from('activity_events')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (userId) query = query.eq('user_id', userId);
        if (eventType) query = query.eq('event_type', eventType);
        if (dateFrom) query = query.gte('created_at', dateFrom);
        if (dateTo) query = query.lte('created_at', dateTo);

        const { data, count, error } = await query;
        if (error) return json({ error: error.message }, 400);
        return json({ events: data ?? [], total: count ?? 0, page, limit });
      }

      case 'list_feedback': {
        const page = Math.max(1, Number(body.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(body.limit) || 25));
        const offset = (page - 1) * limit;
        const category = body.category ? String(body.category) : null;

        let query = admin
          .from('feedback')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (category) query = query.eq('category', category);

        const { data, count, error } = await query;
        if (error) return json({ error: error.message }, 400);
        return json({ feedback: data ?? [], total: count ?? 0, page, limit });
      }

      case 'list_admin_log': {
        const page = Math.max(1, Number(body.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(body.limit) || 50));
        const offset = (page - 1) * limit;

        const { data, count, error } = await admin
          .from('admin_audit_log')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) return json({ error: error.message }, 400);
        return json({ logs: data ?? [], total: count ?? 0, page, limit });
      }

      case 'export_users_csv': {
        const period = currentPeriodStart();
        const { data: profiles } = await admin
          .from('profiles')
          .select('id, email, plan, account_status, license_key, created_at')
          .order('created_at', { ascending: false })
          .limit(5000);

        const ids = (profiles ?? []).map((p) => p.id);
        const { data: usageRows } = ids.length
          ? await admin
              .from('usage_counters')
              .select('user_id, scans_used, audits_used, quick_scans_used, businesses_deep_scanned')
              .in('user_id', ids)
              .eq('period_start', period)
          : { data: [] };

        const usageMap = new Map((usageRows ?? []).map((r) => [r.user_id, r]));
        const headers = [
          'id',
          'email',
          'plan',
          'account_status',
          'license_key',
          'created_at',
          'scans_used',
          'audits_used',
          'quick_scans_used',
          'deep_scans_used',
        ];

        const lines = [headers.join(',')];
        for (const p of profiles ?? []) {
          const u = usageMap.get(p.id);
          lines.push(
            [
              p.id,
              p.email,
              p.plan,
              p.account_status,
              p.license_key,
              p.created_at,
              u?.scans_used ?? 0,
              u?.audits_used ?? 0,
              u?.quick_scans_used ?? 0,
              u?.businesses_deep_scanned ?? 0,
            ]
              .map(escapeCsv)
              .join(',')
          );
        }

        return json({ csv: lines.join('\n'), filename: `rankmappro-users-${period}.csv` });
      }

      case 'export_usage_csv': {
        const period = currentPeriodStart();
        const { data: rows } = await admin
          .from('usage_counters')
          .select(
            'user_id, period_start, scans_used, quick_scans_used, businesses_deep_scanned, audits_used, enrichment_scans_used, csv_exports_used, updated_at'
          )
          .eq('period_start', period)
          .order('scans_used', { ascending: false })
          .limit(5000);

        const userIds = [...new Set((rows ?? []).map((r) => r.user_id))];
        const { data: profiles } = userIds.length
          ? await admin.from('profiles').select('id, email, plan').in('id', userIds)
          : { data: [] };

        const emailMap = new Map((profiles ?? []).map((p) => [p.id, p]));

        const headers = [
          'user_id',
          'email',
          'plan',
          'period_start',
          'scans_used',
          'quick_scans_used',
          'deep_scans_used',
          'audits_used',
          'enrichment_scans_used',
          'csv_exports_used',
          'updated_at',
        ];

        const lines = [headers.join(',')];
        for (const r of rows ?? []) {
          const p = emailMap.get(r.user_id);
          lines.push(
            [
              r.user_id,
              p?.email ?? '',
              p?.plan ?? '',
              r.period_start,
              r.scans_used,
              r.quick_scans_used,
              r.businesses_deep_scanned,
              r.audits_used,
              r.enrichment_scans_used,
              r.csv_exports_used,
              r.updated_at,
            ]
              .map(escapeCsv)
              .join(',')
          );
        }

        return json({ csv: lines.join('\n'), filename: `rankmappro-usage-${period}.csv` });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error('[admin-api]', err);
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});
