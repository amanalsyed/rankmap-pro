import TrackedOutboundLink from '@/components/analytics/TrackedOutboundLink';
import {
  CHROME_STORE_URL,
  CREEM_CHECKOUT_URL,
  LIFETIME_PRICING,
  SITE,
} from '@/content/site';
import styles from './Hero.module.css';

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={`container ${styles.inner}`}>
        <h1 className={`${styles.title} animate-in`}>
          {SITE.heroTitle}
          <span className={styles.titleAccent}> {SITE.heroAccent}</span>
        </h1>

        <p className={`${styles.subtitle} animate-in animate-in-delay-1`}>
          {SITE.heroSubtitle}
        </p>

        <div className={`${styles.ctas} animate-in animate-in-delay-2`}>
          <TrackedOutboundLink
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            ctaKind="install"
            location="hero"
          >
            Install free on Chrome
          </TrackedOutboundLink>
          <TrackedOutboundLink
            href={CREEM_CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            ctaKind="checkout"
            location="hero"
          >
            Get Lifetime — {LIFETIME_PRICING.priceLabel}{' '}
            <span className={styles.discount}>({LIFETIME_PRICING.discountLabel})</span>
          </TrackedOutboundLink>
        </div>
      </div>
    </section>
  );
}
