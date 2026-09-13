'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { callAdminApi } from '@/lib/admin-api';
import { downloadCsvFile } from '@/lib/admin-csv';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import AdminCharts from './AdminCharts';
import AdminLogin from './AdminLogin';
import styles from './AdminDashboard.module.css';

type Tab = 'overview' | 'users' | 'licenses' | 'feedback' | 'activity' | 'audit';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  lifetimeUsers: number;
  freeUsers: number;
  activeLicenses: number;
  feedbackCount: number;
  activeToday: number;
  usageThisMonth: {
    scans: number;
    audits: number;
    quick_scans: number;
    deep_scans: number;
  };
  signupsByDay: { date: string; count: number }[];
  activityByDay: { date: string; count: number }[];
  alerts: { level: string; message: string }[];
}

interface UserRow {
  id: string;
  email: string | null;
  plan: string;
  account_status: string;
  license_key: string | null;
  created_at: string;
  usage: {
    scans_used: number;
    audits_used: number;
    quick_scans_used: number;
    deep_scans_used: number;
  };
}

const EVENT_TYPES = [
  '',
  'sign_in',
  'sign_out',
  'scan_started',
  'batch_scan_started',
  'local_scan',
  'deep_scan',
  'audit_run',
  'license_activated',
  'csv_export',
  'quota_denied',
  'feedback_sent',
];

export default function AdminDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<Record<string, unknown> | null>(null);
  const [licenses, setLicenses] = useState<Record<string, unknown>[]>([]);
  const [licensesTotal, setLicensesTotal] = useState(0);
  const [licensePage, setLicensePage] = useState(1);
  const [licenseSearch, setLicenseSearch] = useState('');
  const [feedback, setFeedback] = useState<Record<string, unknown>[]>([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [feedbackCategory, setFeedbackCategory] = useState('');
  const [activity, setActivity] = useState<Record<string, unknown>[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activityEventType, setActivityEventType] = useState('');
  const [activityDateFrom, setActivityDateFrom] = useState('');
  const [activityDateTo, setActivityDateTo] = useState('');
  const [auditLog, setAuditLog] = useState<Record<string, unknown>[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [impersonationLink, setImpersonationLink] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadOverview = useCallback(async () => {
    setStats(await callAdminApi<Stats>('stats'));
  }, []);

  const loadUsers = useCallback(async () => {
    const data = await callAdminApi<{ users: UserRow[]; total: number }>('list_users', {
      page: userPage,
      limit: 25,
      search,
    });
    setUsers(data.users);
    setUsersTotal(data.total);
  }, [userPage, search]);

  const loadLicenses = useCallback(async () => {
    const data = await callAdminApi<{ licenses: Record<string, unknown>[]; total: number }>(
      'list_licenses',
      { page: licensePage, limit: 25, search: licenseSearch }
    );
    setLicenses(data.licenses);
    setLicensesTotal(data.total);
  }, [licensePage, licenseSearch]);

  const loadFeedback = useCallback(async () => {
    const data = await callAdminApi<{ feedback: Record<string, unknown>[]; total: number }>(
      'list_feedback',
      { page: feedbackPage, limit: 25, category: feedbackCategory || undefined }
    );
    setFeedback(data.feedback);
    setFeedbackTotal(data.total);
  }, [feedbackPage, feedbackCategory]);

  const loadActivity = useCallback(async () => {
    const data = await callAdminApi<{ events: Record<string, unknown>[]; total: number }>(
      'list_activity',
      {
        page: activityPage,
        limit: 50,
        event_type: activityEventType || undefined,
        date_from: activityDateFrom || undefined,
        date_to: activityDateTo || undefined,
        user_id: selectedUserId && tab === 'activity' ? selectedUserId : undefined,
      }
    );
    setActivity(data.events);
    setActivityTotal(data.total);
  }, [activityPage, activityEventType, activityDateFrom, activityDateTo, selectedUserId, tab]);

  const loadAudit = useCallback(async () => {
    const data = await callAdminApi<{ logs: Record<string, unknown>[]; total: number }>(
      'list_admin_log',
      { page: auditPage, limit: 50 }
    );
    setAuditLog(data.logs);
    setAuditTotal(data.total);
  }, [auditPage]);

  useEffect(() => {
    if (!session) return;
    setError('');
    setBusy(true);
    const run = async () => {
      try {
        if (tab === 'overview') await loadOverview();
        if (tab === 'users') await loadUsers();
        if (tab === 'licenses') await loadLicenses();
        if (tab === 'feedback') await loadFeedback();
        if (tab === 'activity') await loadActivity();
        if (tab === 'audit') await loadAudit();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setBusy(false);
      }
    };
    void run();
  }, [session, tab, loadOverview, loadUsers, loadLicenses, loadFeedback, loadActivity, loadAudit]);

  async function handleSignOut() {
    await getSupabaseClient().auth.signOut();
    setStats(null);
    setUsers([]);
    setSelectedUser(null);
    setSelectedUserId(null);
    setImpersonationLink('');
  }

  async function runAction(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const result = await callAdminApi<{ link?: string }>(action, payload);
      if (action === 'generate_impersonation_link' && result.link) {
        setImpersonationLink(result.link);
      }
      if (tab === 'users') await loadUsers();
      if (tab === 'licenses') await loadLicenses();
      if (tab === 'overview') await loadOverview();
      if (selectedUserId) await openUser(selectedUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function openUser(userId: string) {
    setSelectedUserId(userId);
    setImpersonationLink('');
    setBusy(true);
    setError('');
    try {
      const data = await callAdminApi<{
        profile: Record<string, unknown>;
        usage: Record<string, unknown>[];
        licenses: Record<string, unknown>[];
        recent_activity: Record<string, unknown>[];
      }>('get_user', { user_id: userId });
      setSelectedUser({
        ...data.profile,
        _usage: data.usage,
        _licenses: data.licenses,
        _activity: data.recent_activity,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv(type: 'export_users_csv' | 'export_usage_csv') {
    setBusy(true);
    setError('');
    try {
      const data = await callAdminApi<{ csv: string; filename: string }>(type);
      downloadCsvFile(data.csv, data.filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className={styles.page}>
        <div className="container">
          <div className={styles.loginBox}>
            <h1 className={styles.loginTitle}>Admin not configured</h1>
            <p className={styles.loginHint}>Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in website/.env.local</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className="container"><p className={styles.empty}>Loading…</p></div>
      </div>
    );
  }

  if (!session) {
    return <AdminLogin busy={busy} setBusy={setBusy} />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'licenses', label: 'Licenses' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'activity', label: 'Activity' },
    { id: 'audit', label: 'Audit log' },
  ];

  const usageRows = (selectedUser?._usage as Record<string, unknown>[] | undefined) ?? [];
  const currentUsage = usageRows[0];

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Admin Dashboard</h1>
            <p className={styles.subtitle}>{session.user.email}</p>
          </div>
          <div className={styles.actions}>
            <button className="btn btn-secondary" type="button" onClick={() => exportCsv('export_users_csv')}>Export users CSV</button>
            <button className="btn btn-secondary" type="button" onClick={() => exportCsv('export_usage_csv')}>Export usage CSV</button>
            <button className="btn btn-secondary" type="button" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>

        <div className={styles.tabs}>
          {tabs.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? styles.tabActive : styles.tab} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {busy && <p className={styles.empty}>Working…</p>}

        {tab === 'overview' && stats && (
          <>
            {stats.alerts.length > 0 && (
              <div className={styles.alertsPanel}>
                <h3>Alerts</h3>
                {stats.alerts.map((a, i) => (
                  <div key={i} className={a.level === 'warning' ? styles.alertWarning : styles.alertInfo}>{a.message}</div>
                ))}
              </div>
            )}
            <div className={styles.grid}>
              <div className={styles.card}><div className={styles.cardLabel}>Total users</div><div className={styles.cardValue}>{stats.totalUsers}</div></div>
              <div className={styles.card}><div className={styles.cardLabel}>Active today</div><div className={styles.cardValue}>{stats.activeToday}</div></div>
              <div className={styles.card}><div className={styles.cardLabel}>Active accounts</div><div className={styles.cardValue}>{stats.activeUsers}</div></div>
              <div className={styles.card}><div className={styles.cardLabel}>Suspended</div><div className={styles.cardValue}>{stats.suspendedUsers}</div></div>
              <div className={styles.card}><div className={styles.cardLabel}>Lifetime</div><div className={styles.cardValue}>{stats.lifetimeUsers}</div></div>
              <div className={styles.card}><div className={styles.cardLabel}>Free</div><div className={styles.cardValue}>{stats.freeUsers}</div></div>
              <div className={styles.card}><div className={styles.cardLabel}>Active licenses</div><div className={styles.cardValue}>{stats.activeLicenses}</div></div>
              <div className={styles.card}><div className={styles.cardLabel}>Feedback</div><div className={styles.cardValue}>{stats.feedbackCount}</div></div>
            </div>
            <AdminCharts signupsByDay={stats.signupsByDay} activityByDay={stats.activityByDay} />
            <div className={styles.panel}>
              <h3>Usage this month (all users)</h3>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}><strong>Scans</strong>{stats.usageThisMonth.scans}</div>
                <div className={styles.detailItem}><strong>Quick scans</strong>{stats.usageThisMonth.quick_scans}</div>
                <div className={styles.detailItem}><strong>Deep scans</strong>{stats.usageThisMonth.deep_scans}</div>
                <div className={styles.detailItem}><strong>Audits</strong>{stats.usageThisMonth.audits}</div>
              </div>
            </div>
          </>
        )}

        {tab === 'users' && (
          <div className={styles.panel}>
            <div className={styles.toolbar}>
              <input className={styles.input} placeholder="Search email, user ID, or license key" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setUserPage(1); void loadUsers(); } }} />
              <button className="btn btn-secondary" type="button" onClick={() => { setUserPage(1); void loadUsers(); }}>Search</button>
            </div>

            {selectedUser && (
              <div className={styles.panel} style={{ marginBottom: 16 }}>
                <h3>User detail</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}><strong>Email</strong>{String(selectedUser.email ?? '—')}</div>
                  <div className={styles.detailItem}><strong>Plan</strong>{String(selectedUser.plan)}</div>
                  <div className={styles.detailItem}><strong>Status</strong>{String(selectedUser.account_status ?? 'active')}</div>
                  <div className={styles.detailItem}><strong>User ID</strong><span className={styles.mono}>{String(selectedUser.id)}</span></div>
                  {currentUsage && (
                    <>
                      <div className={styles.detailItem}><strong>Scans (month)</strong>{String(currentUsage.scans_used)}</div>
                      <div className={styles.detailItem}><strong>Audits (month)</strong>{String(currentUsage.audits_used)}</div>
                      <div className={styles.detailItem}><strong>Quick scans</strong>{String(currentUsage.quick_scans_used)}</div>
                      <div className={styles.detailItem}><strong>Deep scans</strong>{String(currentUsage.businesses_deep_scanned)}</div>
                    </>
                  )}
                </div>
                {impersonationLink && (
                  <div className={styles.impersonationBox}>
                    <strong>Impersonation link (open in incognito, expires quickly):</strong>
                    <a href={impersonationLink} target="_blank" rel="noreferrer">{impersonationLink}</a>
                  </div>
                )}
                <div className={styles.actions}>
                  <button className={styles.btnSmallPrimary} type="button" onClick={() => runAction('restore_user', { user_id: selectedUserId })}>Restore</button>
                  <button className={styles.btnSmall} type="button" onClick={() => { const reason = window.prompt('Suspension reason?') ?? 'Suspended by admin'; void runAction('suspend_user', { user_id: selectedUserId, reason }); }}>Suspend</button>
                  <button className={styles.btnSmallDanger} type="button" onClick={() => { if (window.confirm('Soft-delete and ban auth?')) void runAction('delete_user', { user_id: selectedUserId }); }}>Soft delete</button>
                  <button className={styles.btnSmallDanger} type="button" onClick={() => { if (window.confirm('PERMANENTLY delete user from auth? Cannot undo.')) void runAction('hard_delete_user', { user_id: selectedUserId }); }}>Hard delete</button>
                  <button className={styles.btnSmall} type="button" onClick={() => runAction('change_plan', { user_id: selectedUserId, plan: 'free' })}>Set free</button>
                  <button className={styles.btnSmall} type="button" onClick={() => runAction('change_plan', { user_id: selectedUserId, plan: 'lifetime' })}>Set lifetime</button>
                  <button className={styles.btnSmall} type="button" onClick={() => runAction('reset_usage', { user_id: selectedUserId })}>Reset usage</button>
                  <button className={styles.btnSmall} type="button" onClick={() => runAction('generate_impersonation_link', { user_id: selectedUserId })}>Impersonate</button>
                  <button className={styles.btnSmall} type="button" onClick={() => { setTab('activity'); setActivityPage(1); }}>View activity</button>
                  <button className={styles.btnSmall} type="button" onClick={() => setSelectedUser(null)}>Close</button>
                </div>
              </div>
            )}

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Scans</th>
                    <th>Audits</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.email ?? '—'}</td>
                      <td><span className={styles.badgePlan}>{u.plan}</span></td>
                      <td><span className={u.account_status === 'active' ? styles.badgeActive : u.account_status === 'suspended' ? styles.badgeSuspended : styles.badgeDeleted}>{u.account_status}</span></td>
                      <td>{u.usage.scans_used}</td>
                      <td>{u.usage.audits_used}</td>
                      <td>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td><button className={styles.btnSmallPrimary} type="button" onClick={() => openUser(u.id)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <span>{usersTotal} users</span>
              <div className={styles.actions}>
                <button className={styles.btnSmall} type="button" disabled={userPage <= 1} onClick={() => setUserPage((p) => p - 1)}>Prev</button>
                <span>Page {userPage}</span>
                <button className={styles.btnSmall} type="button" disabled={userPage * 25 >= usersTotal} onClick={() => setUserPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'licenses' && (
          <div className={styles.panel}>
            <div className={styles.toolbar}>
              <input className={styles.input} placeholder="Search email or license key" value={licenseSearch} onChange={(e) => setLicenseSearch(e.target.value)} />
              <button className="btn btn-secondary" type="button" onClick={() => { setLicensePage(1); void loadLicenses(); }}>Search</button>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Key</th><th>Email</th><th>Status</th><th>User</th><th>Created</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {licenses.map((l) => (
                    <tr key={String(l.id)}>
                      <td className={styles.mono}>{String(l.license_key).slice(0, 16)}…</td>
                      <td>{String(l.email)}</td>
                      <td>{String(l.status)}</td>
                      <td>{l.user_id ? String(l.user_id).slice(0, 8) + '…' : '—'}</td>
                      <td>{new Date(String(l.created_at)).toLocaleDateString()}</td>
                      <td>
                        <div className={styles.actions}>
                          {l.status === 'active' && (
                            <button className={styles.btnSmallDanger} type="button" onClick={() => { if (window.confirm('Revoke?')) void runAction('revoke_license', { license_id: l.id }); }}>Revoke</button>
                          )}
                          {l.status === 'active' && (
                            <button className={styles.btnSmall} type="button" onClick={() => {
                              const userId = window.prompt('Target user UUID to assign this license to:');
                              if (userId) void runAction('reassign_license', { license_id: l.id, user_id: userId.trim() });
                            }}>Reassign</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <span>{licensesTotal} licenses</span>
              <div className={styles.actions}>
                <button className={styles.btnSmall} type="button" disabled={licensePage <= 1} onClick={() => setLicensePage((p) => p - 1)}>Prev</button>
                <button className={styles.btnSmall} type="button" disabled={licensePage * 25 >= licensesTotal} onClick={() => setLicensePage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'feedback' && (
          <div className={styles.panel}>
            <div className={styles.toolbar}>
              <select className={styles.select} value={feedbackCategory} onChange={(e) => { setFeedbackCategory(e.target.value); setFeedbackPage(1); }}>
                <option value="">All categories</option>
                <option value="bug">Bug</option>
                <option value="feature">Feature</option>
                <option value="general">General</option>
              </select>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Date</th><th>Category</th><th>Email</th><th>Plan</th><th>Message</th></tr></thead>
                <tbody>
                  {feedback.map((f) => (
                    <tr key={String(f.id)}>
                      <td>{new Date(String(f.created_at)).toLocaleString()}</td>
                      <td>{String(f.category)}</td>
                      <td>{String(f.email ?? '—')}</td>
                      <td>{String(f.plan ?? '—')}</td>
                      <td className={styles.messagePreview}>{String(f.message)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className={styles.panel}>
            <div className={styles.toolbar}>
              <select className={styles.select} value={activityEventType} onChange={(e) => { setActivityEventType(e.target.value); setActivityPage(1); }}>
                {EVENT_TYPES.map((t) => (
                  <option key={t || 'all'} value={t}>{t || 'All event types'}</option>
                ))}
              </select>
              <input className={styles.input} type="date" value={activityDateFrom} onChange={(e) => { setActivityDateFrom(e.target.value); setActivityPage(1); }} />
              <input className={styles.input} type="date" value={activityDateTo} onChange={(e) => { setActivityDateTo(e.target.value); setActivityPage(1); }} />
              <button className="btn btn-secondary" type="button" onClick={() => void loadActivity()}>Apply filters</button>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Date</th><th>Type</th><th>User</th><th>Metadata</th></tr></thead>
                <tbody>
                  {activity.length === 0 ? (
                    <tr><td colSpan={4} className={styles.empty}>No activity events yet — they appear when users use the extension</td></tr>
                  ) : activity.map((e) => (
                    <tr key={String(e.id)}>
                      <td>{new Date(String(e.created_at)).toLocaleString()}</td>
                      <td><span className={styles.badgePlan}>{String(e.event_type)}</span></td>
                      <td className={styles.mono}>{e.user_id ? String(e.user_id).slice(0, 8) + '…' : '—'}</td>
                      <td className={styles.messagePreview}>{JSON.stringify(e.metadata)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <span>{activityTotal} events</span>
              <div className={styles.actions}>
                <button className={styles.btnSmall} type="button" disabled={activityPage <= 1} onClick={() => setActivityPage((p) => p - 1)}>Prev</button>
                <button className={styles.btnSmall} type="button" disabled={activityPage * 50 >= activityTotal} onClick={() => setActivityPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div className={styles.panel}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Date</th><th>Action</th><th>Admin</th><th>Target</th><th>Details</th></tr></thead>
                <tbody>
                  {auditLog.map((l) => (
                    <tr key={String(l.id)}>
                      <td>{new Date(String(l.created_at)).toLocaleString()}</td>
                      <td>{String(l.action)}</td>
                      <td className={styles.mono}>{l.admin_id ? String(l.admin_id).slice(0, 8) + '…' : '—'}</td>
                      <td className={styles.mono}>{l.target_user_id ? String(l.target_user_id).slice(0, 8) + '…' : '—'}</td>
                      <td className={styles.messagePreview}>{JSON.stringify(l.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
