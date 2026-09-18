import {
  CHROME_STORE_URL,
  CREEM_CHECKOUT_URL,
  EXTENSION_INSTALL_NOTE,
  LIFETIME_PRICING,
  SITE,
} from '@/content/site';
import styles from './Hero.module.css';

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={`container ${styles.inner}`}>
        <div className={`${styles.badge} animate-in`}>
          <span className={styles.badgeDot} />
          Live on Chrome Web Store · Google Maps
        </div>

        <h1 className={`${styles.title} animate-in animate-in-delay-1`}>
          {SITE.heroTitle}
          <span className={styles.titleAccent}> {SITE.heroAccent}</span>
        </h1>

        <p className={`${styles.subtitle} animate-in animate-in-delay-2`}>
          {SITE.heroSubtitle}
        </p>

        <div className={`${styles.ctas} animate-in animate-in-delay-3`}>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Install free on Chrome
          </a>
          <a
            href={CREEM_CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            Get Lifetime — {LIFETIME_PRICING.priceLabel}{' '}
            <span className={styles.discount}>({LIFETIME_PRICING.discountLabel})</span>
          </a>
        </div>

        <p className={`${styles.comingSoon} animate-in animate-in-delay-3`}>
          {EXTENSION_INSTALL_NOTE}
        </p>

        <ul className={`${styles.stats} animate-in animate-in-delay-4`}>
          <li>
            <strong>No-website leads</strong>
            <span>find prospects on Maps</span>
          </li>
          <li>
            <strong>GBP audits</strong>
            <span>score & export PDFs</span>
          </li>
          <li>
            <strong>Rank check</strong>
            <span>pin-point geo rankings</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
