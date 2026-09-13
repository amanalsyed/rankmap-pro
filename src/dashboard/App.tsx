import { useEffect, useState } from 'react';
import HistoryPanel from '../history/HistoryPanel';
import SettingsPanel from '../settings/SettingsPanel';
import DashboardTab from './DashboardTab';
import { parseDashboardTab, type DashboardTabId } from './open-dashboard';
import BrandMark from '../components/BrandMark';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../brand';

const TABS: { id: DashboardTabId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
];

function tabSubtitle(tab: DashboardTabId): string {
  if (tab === 'history') {
    return 'Reopen past scans, compare runs, and manage Local Scan sessions.';
  }
  if (tab === 'settings') {
    return 'Enrichment, exports, and agency branding for audit reports.';
  }
  return PRODUCT_TAGLINE;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<DashboardTabId>(() => {
    const params = new URLSearchParams(window.location.search);
    return parseDashboardTab(params.get('tab'));
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = parseDashboardTab(params.get('tab'));
    setActiveTab(next);
  }, []);

  const selectTab = (tab: DashboardTabId) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === 'dashboard') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', tab);
    }
    window.history.replaceState(null, '', url.pathname + url.search);
  };

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="header">
          <BrandMark />
          <div>
            <h1>{PRODUCT_NAME}</h1>
            <p className="subtitle">{tabSubtitle(activeTab)}</p>
          </div>
        </div>
      </header>

      <nav className="dashboard-tabs" role="tablist" aria-label="Dashboard sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : undefined}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="dashboard-content" role="tabpanel">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'history' && <HistoryPanel />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}
