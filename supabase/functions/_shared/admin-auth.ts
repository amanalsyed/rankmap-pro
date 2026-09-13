import { createAdminClient, getUserFromRequest } from './supabase-admin.ts';

export interface AdminContext {
  adminId: string;
  adminEmail: string | null;
}

export async function requireSuperAdmin(req: Request): Promise<AdminContext | Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, email, is_super_admin, account_status')
    .eq('id', user.id)
    .single();

  if (error || !profile?.is_super_admin || profile.account_status !== 'active') {
    return new Response(JSON.stringify({ error: 'Forbidden — super admin only' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return { adminId: user.id, adminEmail: profile.email ?? user.email ?? null };
}

export async function logAdminAction(
  adminId: string,
  action: string,
  targetUserId: string | null,
  details: Record<string, unknown> = {}
) {
  const admin = createAdminClient();
  await admin.from('admin_audit_log').insert({
    admin_id: adminId,
    action,
    target_user_id: targetUserId,
    details,
  });
}
