export type DashboardTabId = 'dashboard' | 'history' | 'settings';

export function dashboardPageUrl(tab: DashboardTabId = 'dashboard'): string {
  const base = chrome.runtime.getURL('src/dashboard/index.html');
  if (tab === 'dashboard') return base;
  return `${base}?tab=${encodeURIComponent(tab)}`;
}

export function parseDashboardTab(value: string | null): DashboardTabId {
  if (value === 'history' || value === 'settings') return value;
  return 'dashboard';
}
