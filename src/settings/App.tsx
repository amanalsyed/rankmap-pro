import SettingsPanel from './SettingsPanel';
import BrandMark from '../components/BrandMark';

export default function App() {
  return (
    <div className="settings-page">
      <header className="settings-header">
        <div className="header">
          <BrandMark />
          <div>
            <h1>Settings</h1>
            <p className="subtitle">Enrichment, exports, and agency branding for audit reports.</p>
          </div>
        </div>
      </header>

      <SettingsPanel />
    </div>
  );
}
