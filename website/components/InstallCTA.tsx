import TrackedOutboundLink from '@/components/analytics/TrackedOutboundLink';
import {
  CHROME_STORE_URL,
  CREEM_CHECKOUT_URL,
  LIFETIME_PRICING,
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
              <TrackedOutboundLink
                href={CHROME_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                ctaKind="install"
                location="install_cta"
              >
                Install on Chrome
              </TrackedOutboundLink>
              <TrackedOutboundLink
                href={CREEM_CHECKOUT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                ctaKind="checkout"
                location="install_cta"
              >
                Get Lifetime — {LIFETIME_PRICING.priceLabel}
              </TrackedOutboundLink>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
