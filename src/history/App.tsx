import HistoryPanel from './HistoryPanel';
import BrandMark from '../components/BrandMark';

export default function App() {
  return (
    <div className="history-page">
      <header className="history-header">
        <div className="header">
          <BrandMark />
          <div>
            <h1>Scan History</h1>
            <p className="subtitle">
              Reopen past scans, browse GBP audit reports, compare runs, and keep results when starting a new search.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            void chrome.tabs.create({
              url: chrome.runtime.getURL('src/results/index.html'),
              active: true,
            });
          }}
        >
          Current results
        </button>
      </header>

      <HistoryPanel />
    </div>
  );
}
