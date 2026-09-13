import '../settings/settings.css';

export default function BillingCancelApp() {
  const openSettings = () => {
    const settingsUrl = chrome.runtime.getURL('src/settings/index.html');
    void chrome.tabs.create({ url: settingsUrl, active: true });
  };

  return (
    <div className="billing-page">
      <div className="billing-card">
        <h1>Purchase canceled</h1>
        <p>No charges were made. You can purchase RankMap Pro anytime from Settings → Account.</p>
        <div className="billing-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={openSettings}
          >
            Back to Settings
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => window.close()}
          >
            Close tab
          </button>
        </div>
      </div>
    </div>
  );
}
