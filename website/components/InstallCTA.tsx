import {
  CHROME_STORE_URL,
  CREEM_CHECKOUT_URL,
  LIFETIME_PRICING,
  SITE,
} from '@/content/site';
import Reveal from './Reveal';
import styles from './InstallCTA.module.css';

export default function InstallCTA() {
  return (
    <section id="install" className={styles.section}>
      <Reveal>
        <div className={styles.card}>
          <div className={styles.glow} aria-hidden="true" />
          <div className={styles.content}>
            <span className={styles.badge}>{LIFETIME_PRICING.discountLabel} launch price</span>
            <h2>Install RankMap Pro from the Chrome Web Store</h2>
            <p>
              Start free on Google Maps today. Upgrade to Lifetime for {LIFETIME_PRICING.priceLabel}{' '}
              <s>{LIFETIME_PRICING.compareAtLabel}</s> — one-time payment, all features unlimited.
            </p>
            <div className={styles.actions}>
              <a
                href={CHROME_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                Install on Chrome
              </a>
              <a
                href={CREEM_CHECKOUT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                Get Lifetime — {LIFETIME_PRICING.priceLabel}
              </a>
              <a href={`mailto:${SITE.email}`} className="btn btn-secondary">
                Contact us
              </a>
            </div>
            <ol className={styles.steps}>
              <li>Install the extension from the Chrome Web Store (free tier included)</li>
              <li>Open Google Maps and use lead scan, audits, rank check, and Local Scan</li>
              <li>Optional: purchase Lifetime and activate your license key in Settings → Account</li>
            </ol>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
