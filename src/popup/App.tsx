import { useEffect, useState } from 'react';
import ResultsLeadList from '../components/ResultsLeadList';
import AuditQueueBar from '../components/AuditQueueBar';
import { useAuth } from '../hooks/useAuth';
import { useGbpAudit } from '../hooks/useGbpAudit';
import { useProcessedLeads } from '../hooks/useProcessedLeads';
import { useScanState } from '../hooks/useScanState';
import type { ScanParams } from '../types';
import { downloadCsv } from '../utils/csv-export';
import { parseCityList } from '../utils/parse-cities';
import BrandMark from '../components/BrandMark';
import { PRODUCT_NAME, PRODUCT_SUBTITLE } from '../brand';
import { ADMIN_PANEL_URL } from '../supabase/config';

type ScanMode = 'single' | 'batch';

export default function App() {
  const { state, refreshState } = useScanState();
  const {
    state: authState,
    loading: authLoading,
    signedIn,
    status: authStatus,
    isSuperAdmin,
  } = useAuth();
  const { auditingId, handleAuditGbp, handleRefreshAudit, handleViewAudit } = useGbpAudit();
  const [scanMode, setScanMode] = useState<ScanMode>('single');
  const openAccountSettings = () => {
    void chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD', tab: 'settings' });
  };

  const [niche, setNiche] = useState('Plumbers');
  const [location, setLocation] = useState('Miami, Florida');
  const [citiesText, setCitiesText] = useState(
    'Miami, Florida\nFort Lauderdale, Florida\nWest Palm Beach, Florida\nTampa, Florida'
  );
  const [count, setCount] = useState(100);

  const { progress, results = [], params, sessionName, batchScan } = state;
  const isScanning = progress.status === 'scanning';
  const isPaused = progress.status === 'paused';
  const isEnriching = progress.status === 'enriching';
  const isActive = isScanning || isPaused || isEnriching;

  const leadList = useProcessedLeads(results);

  useEffect(() => {
    if (!params) return;
    setNiche(params.niche);
    setLocation(params.location);
    setCount(params.count);
  }, [params]);

  const handleFind = async () => {
    const perCity = Math.max(1, Math.min(500, Number(count) || 100));
    if (!niche.trim()) return;

    let res: { ok?: boolean; error?: string } | undefined;

    if (scanMode === 'batch') {
      const cities = parseCityList(citiesText);
      if (cities.length === 0) return;
      res = await chrome.runtime.sendMessage({
        type: 'START_BATCH_SCAN',
        niche: niche.trim(),
        citiesText,
        countPerCity: perCity,
      });
    } else {
      const next: ScanParams = {
        niche: niche.trim(),
        location: location.trim(),
        count: perCity,
      };
      if (!next.location) return;
      res = await chrome.runtime.sendMessage({ type: 'START_SCAN', params: next });
    }

    if (res?.ok === false && res.error) {
      window.alert(res.error);
    }

    void refreshState();
  };

  const batchCityCount = parseCityList(citiesText).length;
  const canStart =
    niche.trim() &&
    !isActive &&
    (scanMode === 'single' ? Boolean(location.trim()) : batchCityCount > 0);

  const handlePause = async () => {
    await chrome.runtime.sendMessage({ type: 'PAUSE_SCAN' });
  };

  const handleResume = async () => {
    await chrome.runtime.sendMessage({ type: 'RESUME_SCAN' });
  };

  const handleStop = async () => {
    await chrome.runtime.sendMessage({ type: 'STOP_SCAN' });
  };

  const handleOpenResults = async () => {
    const url = chrome.runtime.getURL('src/results/index.html');
    try {
      await chrome.tabs.create({ url, active: true });
    } catch {
      await chrome.runtime.sendMessage({ type: 'OPEN_RESULTS' });
    }
  };

  const handleExport = async () => {
    const result = await downloadCsv(leadList.processed);
    if (!result.ok && result.error) {
      window.alert(result.error);
    }
  };

  const signedInEmail = authState.profile?.email;
  const showAccountButton = authStatus.configured && !authLoading && signedIn;

  const openDashboard = () => {
    void chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
  };

  return (
    <div className="app">
      <header className="header popup-header">
        <BrandMark />
        <div className="header-copy">
          <h1>{PRODUCT_NAME}</h1>
          <p className="subtitle">{PRODUCT_SUBTITLE}</p>
        </div>
        <div className="header-actions">
          {showAccountButton ? (
            <button
              type="button"
              className="btn-secondary settings-link-btn popup-auth-btn"
              title={signedInEmail ?? 'Account'}
              onClick={openAccountSettings}
            >
              {signedInEmail ? truncateEmail(signedInEmail) : 'Account'}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-secondary settings-link-btn"
            title="Dashboard"
            onClick={openDashboard}
          >
            Dashboard
          </button>
          {isSuperAdmin ? (
            <button
              type="button"
              className="btn-secondary settings-link-btn"
              title="Owner admin panel"
              onClick={() => chrome.tabs.create({ url: ADMIN_PANEL_URL })}
            >
              Admin
            </button>
          ) : null}
        </div>
      </header>

      <section className="controls">
        <div className="scan-mode-toggle" role="tablist" aria-label="Scan mode">
          <button
            type="button"
            role="tab"
            aria-selected={scanMode === 'single'}
            className={scanMode === 'single' ? 'active' : undefined}
            onClick={() => setScanMode('single')}
            disabled={isActive}
          >
            Single city
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scanMode === 'batch'}
            className={scanMode === 'batch' ? 'active' : undefined}
            onClick={() => setScanMode('batch')}
            disabled={isActive}
          >
            Multi-city batch
          </button>
        </div>

        <div className="form-grid">
          <label className="field field-wide">
            <span>Niche</span>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="Plumbers"
              disabled={isActive}
            />
          </label>

          {scanMode === 'single' ? (
            <label className="field field-wide">
              <span>Location</span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Miami, Florida"
                disabled={isActive}
              />
            </label>
          ) : (
            <label className="field field-wide">
              <span>Cities ({batchCityCount})</span>
              <textarea
                className="cities-textarea"
                value={citiesText}
                onChange={(e) => setCitiesText(e.target.value)}
                placeholder={'Miami, Florida\nFort Lauderdale, Florida\nTampa, Florida'}
                rows={4}
                disabled={isActive}
              />
              <small className="field-hint">One city per line (or comma-separated). Scans run sequentially and merge into one list.</small>
            </label>
          )}

          <label className="field">
            <span>{scanMode === 'batch' ? 'Results per city' : 'Results'}</span>
            <input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={isActive}
            />
          </label>
        </div>

        <div className="action-row action-row-primary">
          <button className="btn-primary" onClick={handleFind} disabled={!canStart}>
            {scanMode === 'batch'
              ? `Scan ${batchCityCount} Cities`
              : 'Find Businesses Without Websites'}
          </button>
        </div>

        {isActive && (
          <div className="action-row action-row-controls">
            {isScanning && (
              <button className="btn-pause" onClick={handlePause}>
                Pause
              </button>
            )}

            {isPaused && (
              <button className="btn-resume" onClick={handleResume}>
                Resume
              </button>
            )}

            <button className="btn-stop" onClick={handleStop}>
              Stop
            </button>
          </div>
        )}

        <div className="action-row action-row-secondary">
          <button className="btn-secondary" onClick={handleOpenResults}>
            View Results
          </button>
          <button
            className="btn-secondary"
            onClick={handleExport}
            disabled={leadList.filteredCount === 0}
          >
            Export leads CSV ({leadList.filteredCount})
          </button>
        </div>
      </section>

      <AuditQueueBar compact />

      {(isActive || progress.status === 'complete' || progress.status === 'error') && (
        <section className={`progress ${isPaused ? 'progress-paused' : ''}`}>
          <p className="progress-title">
            {batchScan?.active && progress.batchCityIndex && progress.batchCityTotal ? (
              <>
                City {progress.batchCityIndex} of {progress.batchCityTotal}
                {progress.batchCity ? ` — ${progress.batchCity}` : ''}
                {isScanning && ' · Scanning…'}
                {isEnriching && ' · Enriching…'}
                {isPaused && ' · Paused'}
              </>
            ) : (
              <>
                {isPaused && 'Scan paused'}
                {isScanning && 'Scanning Google Maps…'}
                {isEnriching && 'Enriching business records…'}
                {progress.status === 'complete' && (progress.message ?? 'Scan complete')}
                {progress.status === 'error' && (progress.message ?? 'Something went wrong.')}
              </>
            )}
          </p>
          <div className="progress-stats">
            <div className="stat">
              <span>Checked</span>
              <strong>{progress.checked}</strong>
            </div>
            <div className="stat">
              <span>No website</span>
              <strong>{progress.withoutWebsite}</strong>
            </div>
            {(isEnriching || (progress.enriching ?? 0) > 0) && (
              <div className="stat">
                <span>Enriching</span>
                <strong>{progress.enriching ?? 0}</strong>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="results">
        <div className="results-header">
          <h2>
            Results ({leadList.filteredCount}
            {leadList.filteredCount !== leadList.totalCount ? ` of ${leadList.totalCount}` : ''})
            {sessionName ? <span className="session-name-badge">{sessionName}</span> : null}
          </h2>
          <button
            className="btn-secondary"
            onClick={handleExport}
            disabled={leadList.filteredCount === 0}
          >
            Export leads CSV
          </button>
        </div>
        <ResultsLeadList
          leads={results}
          processed={leadList.processed}
          filters={leadList.filters}
          sortKey={leadList.sortKey}
          totalCount={leadList.totalCount}
          filteredCount={leadList.filteredCount}
          activeFilterCount={leadList.activeFilterCount}
          onFiltersChange={leadList.setFilters}
          onSortChange={leadList.setSortKey}
          onResetFilters={leadList.resetFilters}
          auditingId={auditingId}
          onAuditGbp={handleAuditGbp}
          onRefreshAudit={handleRefreshAudit}
          onViewAudit={handleViewAudit}
        />
      </section>
    </div>
  );
}

function truncateEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 10) return email;
  return `${local.slice(0, 9)}…${domain}`;
}
