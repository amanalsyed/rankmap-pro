import { CREEM_CHECKOUT_URL, EXTENSION_COMING_SOON, SITE } from '@/content/site';
import styles from './Hero.module.css';

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={`container ${styles.inner}`}>
        <div className={`${styles.badge} animate-in`}>
          <span className={styles.badgeDot} />
          Chrome extension · Coming soon · Google Maps
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
            href={CREEM_CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Get Lifetime — $19
          </a>
          <span className="btn btn-secondary btn-disabled" aria-disabled="true">
            Chrome extension — Coming soon
          </span>
          <a href="#features" className="btn btn-secondary">
            See all features
          </a>
        </div>

        <p className={`${styles.comingSoon} animate-in animate-in-delay-3`}>
          {EXTENSION_COMING_SOON}
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
