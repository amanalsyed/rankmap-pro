import { useState } from 'react';
import type { Plan } from '../supabase/types';
import LicenseKeyInput from './LicenseKeyInput';

interface UpgradePlansProps {
  currentPlan: Plan;
  onLicenseActivated?: () => void;
}

const CREEM_CHECKOUT_URL = 'https://www.creem.io/test/payment/prod_7DxgW3XhvPE2aPSZhKk0u8';
const LIFETIME_PRICE = '$19';
const LIFETIME_COMPARE_AT = '$29';
const MONEY_BACK_GUARANTEE = '14-day money-back guarantee — no questions asked.';

const FREE_FEATURES = [
  '1 lead scan / month',
  '2 GBP audits / month',
  '2 quick Local Scans / month',
  '1 deep scan profile / month',
  'Single-city scans (up to 50 results)',
  'Enrichment on 1 scan / month',
  '1 CSV export / month',
  '1 rank-check pin',
];

const LIFETIME_FEATURES = [
  'Unlimited lead scans, GBP audits & deep profiles',
  'Unlimited quick Local Scans & CSV exports',
  'Batch scan up to 99 cities (999 results per scan)',
  'Full enrichment on every scan + post-audit enrichment',
  '99-pin rank check',
  'White-label audit PDFs',
];

export default function UpgradePlans({ currentPlan, onLicenseActivated }: UpgradePlansProps) {
  const [showLicenseInput, setShowLicenseInput] = useState(false);

  const handlePurchase = () => {
    // Open Creem.io checkout page
    window.open(CREEM_CHECKOUT_URL, '_blank', 'noopener,noreferrer');
  };

  const handleLicenseSuccess = () => {
    setShowLicenseInput(false);
    onLicenseActivated?.();
  };

  if (showLicenseInput) {
    return (
      <div className="account-upgrade" id="upgrade">
        <LicenseKeyInput
          onSuccess={handleLicenseSuccess}
          onCancel={() => setShowLicenseInput(false)}
        />
      </div>
    );
  }

  return (
    <div className="account-upgrade" id="upgrade">
      <h3>Plans</h3>
      <p className="settings-hint">
        Launch price — one-time payment, lifetime access. Payments processed by Creem.io.
      </p>

      <div className="plan-cards">
        <article className={`plan-card${currentPlan === 'free' ? ' is-current' : ''}`}>
          <div className="plan-card-head">
            <strong>Free</strong>
            <span className="plan-price">$0</span>
          </div>
          <ul className="plan-feature-list">
            {FREE_FEATURES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {currentPlan === 'free' ? <span className="plan-current-label">Current plan</span> : null}
        </article>

        <article
          className={`plan-card plan-card-lifetime${currentPlan === 'lifetime' ? ' is-current' : ''}`}
        >
          <span className="plan-limited-badge">Launch price</span>
          <div className="plan-card-head">
            <strong>Lifetime Pro</strong>
            <span className="plan-price">
              {LIFETIME_PRICE}{' '}
              <s className="plan-price-compare">{LIFETIME_COMPARE_AT}</s>
            </span>
          </div>
          <p className="plan-lifetime-note">Pre-launch offer · regular {LIFETIME_COMPARE_AT} · all features unlimited</p>
          <ul className="plan-feature-list">
            {LIFETIME_FEATURES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {currentPlan === 'lifetime' ? (
            <span className="plan-current-label">✅ Activated</span>
          ) : (
            <div className="plan-card-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={handlePurchase}
              >
                Purchase — {LIFETIME_PRICE}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowLicenseInput(true)}
              >
                I have a license key
              </button>
              <p className="plan-guarantee">{MONEY_BACK_GUARANTEE}</p>
            </div>
          )}
        </article>
      </div>

      {currentPlan === 'lifetime' ? (
        <p className="settings-hint account-lifetime-note">
          ✨ You have Lifetime access — enjoy unlimited features!
        </p>
      ) : null}
    </div>
  );
}
