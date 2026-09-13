import { useEffect } from 'react';
import { refreshUserState } from '../supabase/auth';
import '../settings/settings.css';

export default function BillingSuccessApp() {
  useEffect(() => {
    void refreshUserState();
    const timers = [2000, 5000, 10000].map((delay) =>
      window.setTimeout(() => {
        void refreshUserState();
      }, delay)
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  const openSettings = () => {
    const settingsUrl = chrome.runtime.getURL('src/settings/index.html');
    void chrome.tabs.create({ url: settingsUrl, active: true });
  };

  return (
    <div className="billing-page">
      <div className="billing-card billing-card-success">
        <h1>✅ License Activated!</h1>
        <p>Your RankMap Pro Lifetime plan is now active. Enjoy unlimited features!</p>
        <div className="billing-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={openSettings}
          >
            Open Settings
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
