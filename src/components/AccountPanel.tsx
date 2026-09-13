import { useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getGoogleOAuthSetup } from '../supabase/google-oauth-setup';
import type { Plan } from '../supabase/types';
import UpgradePlans from './UpgradePlans';
import LicenseKeyInput from './LicenseKeyInput';

function formatPlan(plan: Plan): string {
  if (plan === 'lifetime') return 'Lifetime';
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function formatUsage(used: number, limit: number): string {
  if (limit < 0) return `${used} used (unlimited)`;
  return `${used} / ${limit} used this month`;
}

function usagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  return (
    <button type="button" className="btn-secondary account-copy-btn" onClick={() => void handleCopy()}>
      {copied ? 'Copied' : `Copy ${label}`}
    </button>
  );
}

export default function AccountPanel() {
  const {
    state,
    loading,
    signingOut,
    error,
    notice,
    status,
    signedIn,
    signOut,
    refresh,
  } = useAuth();

  const oauthSetup = useMemo(() => getGoogleOAuthSetup(), []);

  if (loading) {
    return (
      <section className="settings-section account-panel">
        <h2>Account</h2>
        <p className="settings-hint">Loading account…</p>
      </section>
    );
  }

  if (!status.configured) {
    return (
      <section className="settings-section account-panel">
        <h2>Account</h2>
        <p className="settings-hint">Cloud sync is not configured for this build.</p>
      </section>
    );
  }

  const profile = state.profile;
  const usage = state.usage;
  const showRedirectHelp =
    Boolean(error) &&
    (error.toLowerCase().includes('redirect') ||
      error.toLowerCase().includes('nonce') ||
      error.toLowerCase().includes('authorization page could not be loaded'));

  return (
    <section className="settings-section account-panel">
      <h2>Account</h2>

      {!signedIn ? (
        <>
          <p className="settings-hint">
            Enter your license key to activate Lifetime access. Free usage is tracked automatically —
            no sign-in required until you upgrade.
          </p>
          <div className="account-auth-actions">
            <div className="account-license-prompt">
              <LicenseKeyInput
                onActivated={async () => {
                  await refresh();
                }}
              />
            </div>
          </div>
        </>
      ) : null}

      {signedIn && profile ? (
        <div className="account-signed-in">
          <div className="account-user-row">
            <div className="account-avatar" aria-hidden="true">
              {(profile.email?.[0] ?? profile.license_key?.[0] ?? 'L').toUpperCase()}
            </div>
            <div className="account-user-meta">
              <strong>{profile.email ?? 'Lifetime license active'}</strong>
              <span className="account-plan-badge">{formatPlan(profile.plan)} plan</span>
            </div>
          </div>

          {usage ? (
            <div className="account-usage">
              <div className="account-usage-item">
                <div className="account-usage-label">
                  <span>Scans</span>
                  <span>{formatUsage(usage.scans_used, usage.scans_limit)}</span>
                </div>
                {usage.scans_limit >= 0 ? (
                  <div className="account-usage-bar">
                    <div
                      className="account-usage-fill"
                      style={{ width: `${usagePercent(usage.scans_used, usage.scans_limit)}%` }}
                    />
                  </div>
                ) : null}
              </div>

              <div className="account-usage-item">
                <div className="account-usage-label">
                  <span>Quick scans</span>
                  <span>{formatUsage(usage.quick_scans_used, usage.quick_scans_limit)}</span>
                </div>
                {usage.quick_scans_limit >= 0 ? (
                  <div className="account-usage-bar">
                    <div
                      className="account-usage-fill"
                      style={{
                        width: `${usagePercent(usage.quick_scans_used, usage.quick_scans_limit)}%`,
                      }}
                    />
                  </div>
                ) : null}
              </div>

              <div className="account-usage-item">
                <div className="account-usage-label">
                  <span>GBP audits</span>
                  <span>{formatUsage(usage.audits_used, usage.audits_limit)}</span>
                </div>
                {usage.audits_limit >= 0 ? (
                  <div className="account-usage-bar">
                    <div
                      className="account-usage-fill"
                      style={{ width: `${usagePercent(usage.audits_used, usage.audits_limit)}%` }}
                    />
                  </div>
                ) : null}
              </div>

              <div className="account-usage-item">
                <div className="account-usage-label">
                  <span>Deep scan profiles</span>
                  <span>{formatUsage(usage.deep_scans_used, usage.deep_scans_limit)}</span>
                </div>
                {usage.deep_scans_limit >= 0 ? (
                  <div className="account-usage-bar">
                    <div
                      className="account-usage-fill"
                      style={{
                        width: `${usagePercent(usage.deep_scans_used, usage.deep_scans_limit)}%`,
                      }}
                    />
                  </div>
                ) : null}
              </div>

              {usage.enrichment_scans_limit != null && usage.enrichment_scans_limit >= 0 ? (
                <div className="account-usage-item">
                  <div className="account-usage-label">
                    <span>Enrichment scans</span>
                    <span>
                      {formatUsage(
                        usage.enrichment_scans_used ?? 0,
                        usage.enrichment_scans_limit
                      )}
                    </span>
                  </div>
                  <div className="account-usage-bar">
                    <div
                      className="account-usage-fill"
                      style={{
                        width: `${usagePercent(
                          usage.enrichment_scans_used ?? 0,
                          usage.enrichment_scans_limit
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {usage.csv_exports_limit != null && usage.csv_exports_limit >= 0 ? (
                <div className="account-usage-item">
                  <div className="account-usage-label">
                    <span>CSV exports</span>
                    <span>
                      {formatUsage(usage.csv_exports_used ?? 0, usage.csv_exports_limit)}
                    </span>
                  </div>
                  <div className="account-usage-bar">
                    <div
                      className="account-usage-fill"
                      style={{
                        width: `${usagePercent(
                          usage.csv_exports_used ?? 0,
                          usage.csv_exports_limit
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {profile.license_key && profile.plan === 'lifetime' ? (
            <div className="account-license-info">
              <p className="settings-hint">
                <strong>License Key:</strong> <code>{profile.license_key}</code>
              </p>
            </div>
          ) : null}

          <button
            type="button"
            className="btn-secondary account-sign-out"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>

          {profile.plan === 'free' ? (
            <UpgradePlans currentPlan={profile.plan} onLicenseActivated={() => void refresh()} />
          ) : null}
        </div>
      ) : null}

      {notice ? <p className="account-notice">{notice}</p> : null}

      {error ? (
        <div className="account-error-block">
          <p className="settings-error account-error">{error}</p>
          {showRedirectHelp ? (
            <div className="account-setup-value account-setup-value-inline">
              <code>{oauthSetup.supabaseRedirectUri}</code>
              <CopyButton value={oauthSetup.supabaseRedirectUri} label="redirect URL" />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
