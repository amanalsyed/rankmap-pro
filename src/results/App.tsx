import { downloadCsv } from '../utils/csv-export';
import { useGbpAudit } from '../hooks/useGbpAudit';
import { useProcessedLeads } from '../hooks/useProcessedLeads';
import { useScanState } from '../hooks/useScanState';
import { usePlanCapabilities } from '../hooks/usePlanCapabilities';
import ResultsLeadList from '../components/ResultsLeadList';
import AuditQueueBar from '../components/AuditQueueBar';
import BrandMark from '../components/BrandMark';
import { PRODUCT_NAME, PRODUCT_SUBTITLE } from '../brand';

export default function App() {
  const { plan } = usePlanCapabilities();
  const { state } = useScanState();
  const { auditingId, auditError, handleAuditGbp, handleRefreshAudit, handleViewAudit } = useGbpAudit();
  const { progress, results = [], params, sessionName, viewingArchived, batchScan } = state;
  const isScanning = progress.status === 'scanning';
  const isPaused = progress.status === 'paused';
  const isEnriching = progress.status === 'enriching';

  const leadList = useProcessedLeads(results);

  const handleExport = async () => {
    const result = await downloadCsv(leadList.processed);
    if (!result.ok && result.error) {
      window.alert(result.error);
    }
  };

  return (
    <div className="results-page">
      <header className="results-page-header">
        <div className="header">
          <BrandMark />
          <div>
            <h1>{PRODUCT_NAME}</h1>
            <p className="subtitle">
              {sessionName
                ? sessionName
                : params
                  ? `${params.niche} in ${params.location}`
                  : PRODUCT_SUBTITLE}
            </p>
            {params && sessionName ? (
              <p className="subtitle">{params.niche} in {params.location}</p>
            ) : null}
          </div>
          {plan !== 'free' ? (
            <button
              type="button"
              className="btn-secondary settings-link-btn"
              title="Local Scan reports"
              onClick={() => {
                void chrome.runtime.sendMessage({ type: 'OPEN_LOCAL_SCAN_LATEST' });
              }}
            >
              Local Scan
            </button>
          ) : null}
          <button
            type="button"
            className="btn-secondary settings-link-btn"
            title="Dashboard"
            onClick={() => {
              void chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
            }}
          >
            Dashboard
          </button>
        </div>
        <button
          className="btn-primary export-btn"
          onClick={handleExport}
          disabled={leadList.filteredCount === 0}
        >
          Export leads CSV ({leadList.filteredCount})
        </button>
      </header>

      {viewingArchived ? (
        <div className="archived-banner">
          Viewing a saved scan from history. Results, enrichment, and audits are read-only snapshots unless
          you run a new scan from the popup.
        </div>
      ) : null}

      {plan === 'free' && !viewingArchived ? (
        <div className="archived-banner" style={{ background: '#fff3cd', borderColor: '#ffc107', color: '#856404' }}>
          ⚠️ <strong>Temporary Results</strong> — This scan won't be saved to history. 
          Export your CSV before closing. <a href="#upgrade" onClick={(e) => {
            e.preventDefault();
            chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS', tab: 'account' }).catch(() => {});
          }} style={{ color: '#856404', textDecoration: 'underline' }}>Upgrade to Lifetime</a> for unlimited scans & persistent history.
        </div>
      ) : null}

      <AuditQueueBar />

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
              {isScanning && 'Scanning Google Maps…'}
              {isPaused && 'Scan paused'}
              {isEnriching && 'Enriching business records…'}
              {progress.status === 'complete' && (progress.message ?? 'Scan complete')}
              {progress.status === 'idle' && 'No scan running'}
              {progress.status === 'error' && (progress.message ?? 'Scan failed')}
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
          <div className="stat">
            <span>In table</span>
            <strong>{results.length}</strong>
          </div>
          {batchScan?.active || progress.batchCityTotal ? (
            <div className="stat">
              <span>Batch</span>
              <strong>
                {progress.batchCityIndex ?? 0}/{progress.batchCityTotal ?? batchScan?.cities.length ?? 0}
              </strong>
            </div>
          ) : null}
          {(isEnriching || (progress.enriching ?? 0) > 0) && (
            <div className="stat">
              <span>Enriching</span>
              <strong>{progress.enriching ?? 0}</strong>
            </div>
          )}
        </div>
      </section>

      <section className="results">
        <div className="results-header">
          <h2>
            Results ({leadList.filteredCount}
            {leadList.filteredCount !== leadList.totalCount ? ` of ${leadList.totalCount}` : ''})
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
          auditError={auditError}
          plan={plan}
          onAuditGbp={handleAuditGbp}
          onRefreshAudit={handleRefreshAudit}
          onViewAudit={handleViewAudit}
        />
      </section>
    </div>
  );
}
