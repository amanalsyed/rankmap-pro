import { useCallback, useRef, useState } from 'react';
import AccountPanel from '../components/AccountPanel';
import FeedbackModal from '../components/FeedbackModal';
import { useEnrichmentSettings } from '../hooks/useEnrichmentSettings';
import { usePlanCapabilities } from '../hooks/usePlanCapabilities';
import { useWhiteLabelSettings } from '../hooks/useWhiteLabelSettings';
import { upgradeMessage } from '../supabase/plan-capabilities';
import type { EnrichmentPlatformSettings } from './enrichment-settings';
import { enrichmentSearchEnabled } from './enrichment-settings';
import { MAX_LOGO_BYTES } from './white-label-settings';

const PLATFORM_LABELS: Record<keyof EnrichmentPlatformSettings, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  twitter: 'Twitter / X',
  tiktok: 'TikTok',
  email: 'Email & contact',
  owner: 'Owner / decision maker',
  yelp: 'Yelp',
  yellowpages: 'Yellow Pages',
  bbb: 'BBB',
  angi: 'Angi',
  thumbtack: 'Thumbtack',
  manta: 'Manta',
  foursquare: 'Foursquare',
  mapquest: 'MapQuest',
};

export default function SettingsPanel() {
  const enrichment = useEnrichmentSettings();
  const whiteLabel = useWhiteLabelSettings();
  const { capabilities, plan } = usePlanCapabilities();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const loading = enrichment.loading || whiteLabel.loading;
  const saving = enrichment.saving || whiteLabel.saving;
  const saved = enrichment.saved || whiteLabel.saved;
  const searchEnrichmentOn = enrichmentSearchEnabled(enrichment.settings);
  const auditEnrichmentLocked = !capabilities.auditEnrichmentEnabled;
  const whiteLabelLocked = !capabilities.whiteLabelEnabled;
  const whiteLabelFieldsEnabled =
    !whiteLabelLocked &&
    (whiteLabel.settings.enabled || whiteLabel.settings.showOnAuditPage);

  const handleSaveAll = () => {
    void Promise.all([enrichment.save(enrichment.settings), whiteLabel.save(whiteLabel.settings)]);
  };

  const saveWhiteLabelPatch = (patch: Partial<typeof whiteLabel.settings>) => {
    void whiteLabel.save({ ...whiteLabel.settings, ...patch });
  };

  const handleLogoChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setLogoError('');
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        setLogoError('Please choose a PNG, JPEG, or WebP image.');
        return;
      }

      if (file.size > MAX_LOGO_BYTES) {
        setLogoError(`Logo must be under ${Math.round(MAX_LOGO_BYTES / 1024)} KB.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (result.startsWith('data:image/')) {
          whiteLabel.updateSettings({ logoDataUrl: result });
        } else {
          setLogoError('Could not read the image file.');
        }
      };
      reader.onerror = () => setLogoError('Could not read the image file.');
      reader.readAsDataURL(file);
    },
    [whiteLabel]
  );

  if (loading) {
    return <p className="settings-loading">Loading settings…</p>;
  }

  return (
    <>
      <AccountPanel />

      <section className="settings-section">
        <h2>White-label branding</h2>
        <p className="settings-hint">
          Add your agency name, logo, and contact details to audit reports in the extension and on
          exported PDFs — ideal when sending reports to prospects.
        </p>
        {whiteLabelLocked ? (
          <p className="settings-plan-lock">{upgradeMessage('White-label audit PDFs')}</p>
        ) : null}

        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={whiteLabel.settings.showOnAuditPage}
            onChange={(e) => saveWhiteLabelPatch({ showOnAuditPage: e.target.checked })}
            disabled={whiteLabelLocked}
          />
          <span>
            <strong>Show agency branding on audit page</strong>
            <small>
              When enabled, your logo and contact info appear at the top of the audit report while
              viewing it in the extension.
            </small>
          </span>
        </label>

        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={whiteLabel.settings.enabled}
            onChange={(e) => saveWhiteLabelPatch({ enabled: e.target.checked })}
            disabled={whiteLabelLocked}
          />
          <span>
            <strong>Show agency branding on audit PDFs</strong>
            <small>When enabled, your logo and contact info appear at the top of exported audit PDFs.</small>
          </span>
        </label>

        <label className="settings-field">
          <span>Agency name</span>
          <input
            type="text"
            className="settings-text-input"
            value={whiteLabel.settings.agencyName}
            onChange={(e) => whiteLabel.updateSettings({ agencyName: e.target.value })}
            placeholder="Acme Digital Marketing"
            disabled={!whiteLabelFieldsEnabled}
          />
        </label>

        <label className="settings-field">
          <span>Tagline (optional)</span>
          <input
            type="text"
            className="settings-text-input"
            value={whiteLabel.settings.tagline}
            onChange={(e) => whiteLabel.updateSettings({ tagline: e.target.value })}
            placeholder="Helping local businesses grow online"
            disabled={!whiteLabelFieldsEnabled}
          />
        </label>

        <div className="settings-field">
          <span>Logo (optional)</span>
          <div className="settings-logo-row">
            {whiteLabel.settings.logoDataUrl ? (
              <img
                className="settings-logo-preview"
                src={whiteLabel.settings.logoDataUrl}
                alt="Agency logo preview"
              />
            ) : (
              <div className="settings-logo-placeholder">No logo</div>
            )}
            <div className="settings-logo-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => logoInputRef.current?.click()}
                disabled={!whiteLabelFieldsEnabled}
              >
                Upload logo
              </button>
              {whiteLabel.settings.logoDataUrl ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => whiteLabel.updateSettings({ logoDataUrl: '' })}
                  disabled={!whiteLabelFieldsEnabled}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="settings-file-input"
            onChange={handleLogoChange}
          />
          <small>PNG, JPEG, or WebP. Max {Math.round(MAX_LOGO_BYTES / 1024)} KB.</small>
          {logoError ? <small className="settings-error">{logoError}</small> : null}
        </div>

        <label className="settings-field">
          <span>Contact email</span>
          <input
            type="email"
            className="settings-text-input"
            value={whiteLabel.settings.contactEmail}
            onChange={(e) => whiteLabel.updateSettings({ contactEmail: e.target.value })}
            placeholder="hello@agency.com"
            disabled={!whiteLabelFieldsEnabled}
          />
        </label>

        <label className="settings-field">
          <span>Phone</span>
          <input
            type="tel"
            className="settings-text-input"
            value={whiteLabel.settings.contactPhone}
            onChange={(e) => whiteLabel.updateSettings({ contactPhone: e.target.value })}
            placeholder="(555) 123-4567"
            disabled={!whiteLabelFieldsEnabled}
          />
        </label>

        <label className="settings-field">
          <span>Website</span>
          <input
            type="url"
            className="settings-text-input"
            value={whiteLabel.settings.website}
            onChange={(e) => whiteLabel.updateSettings({ website: e.target.value })}
            placeholder="https://agency.com"
            disabled={!whiteLabelFieldsEnabled}
          />
        </label>
      </section>

      <section className="settings-section">
        <h2>During scan</h2>
        {plan === 'free' ? (
          <p className="settings-hint">
            Free plan includes contact enrichment on <strong>one</strong> of your 3 monthly lead scans.
            When enrichment is enabled, all no-website leads in that scan are enriched. Your other scans
            this month will not enrich.
          </p>
        ) : null}
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={enrichment.settings.enrichDuringScan}
            onChange={(e) => enrichment.updateSettings({ enrichDuringScan: e.target.checked })}
          />
          <span>
            <strong>Enrich leads automatically</strong>
            <small>
              Search Google for emails, social profiles, and owner names after each no-website lead is found.
            </small>
          </span>
        </label>
      </section>

      <section className="settings-section">
        <h2>After GBP audit</h2>
        {auditEnrichmentLocked ? (
          <p className="settings-plan-lock">{upgradeMessage('Contact enrichment after GBP audit')}</p>
        ) : null}
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={enrichment.settings.enrichAfterGbpAudit}
            onChange={(e) => enrichment.updateSettings({ enrichAfterGbpAudit: e.target.checked })}
            disabled={auditEnrichmentLocked}
          />
          <span>
            <strong>Find contacts after GBP audit</strong>
            <small>
              After auditing any business on Google Maps (including those with websites), search Google
              for social profiles, emails, and owner names. Results appear on the audit report.
            </small>
          </span>
        </label>
      </section>

      <section className="settings-section">
        <h2>Platforms to search</h2>
        <p className="settings-hint">
          Only enabled platforms are queried on Google Search. Fewer platforms = faster scans and lower
          rate-limit risk. Applies to both scan enrichment and post-audit contact lookup.
        </p>
        <div className="settings-platform-grid">
          {(Object.keys(PLATFORM_LABELS) as (keyof EnrichmentPlatformSettings)[]).map((key) => (
            <label key={key} className="settings-check">
              <input
                type="checkbox"
                checked={enrichment.settings.platforms[key]}
                onChange={() => enrichment.togglePlatform(key)}
                disabled={!searchEnrichmentOn}
              />
              <span>{PLATFORM_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>Rate limits</h2>

        <label className="settings-field">
          <span>Delay between searches</span>
          <div className="settings-range-row">
            <input
              type="range"
              min={400}
              max={3000}
              step={100}
              value={enrichment.settings.searchDelayMs}
              onChange={(e) => enrichment.updateSettings({ searchDelayMs: Number(e.target.value) })}
              disabled={!searchEnrichmentOn}
            />
            <strong>{enrichment.settings.searchDelayMs} ms</strong>
          </div>
          <small>Higher delay is safer when Google shows captchas or throttles results.</small>
        </label>

        <label className="settings-field">
          <span>Concurrent search tabs</span>
          <select
            value={enrichment.settings.maxConcurrentSearches}
            onChange={(e) => enrichment.updateSettings({ maxConcurrentSearches: Number(e.target.value) })}
            disabled={!searchEnrichmentOn}
          >
            <option value={1}>1 — sequential (recommended)</option>
            <option value={2}>2 — moderate</option>
            <option value={3}>3 — faster, higher risk</option>
          </select>
          <small>How many Google Search tabs run in parallel per lead.</small>
        </label>
      </section>

      <section className="settings-section">
        <h2>Feedback</h2>
        <p className="settings-hint">
          Report a bug, request a feature, or share general feedback. We read every message.
        </p>
        <button type="button" className="btn-secondary" onClick={() => setFeedbackOpen(true)}>
          Send feedback
        </button>
      </section>

      <footer className="settings-footer">
        <button type="button" className="btn-primary" onClick={handleSaveAll} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save settings'}
        </button>
      </footer>

      {feedbackOpen ? <FeedbackModal onClose={() => setFeedbackOpen(false)} /> : null}
    </>
  );
}
