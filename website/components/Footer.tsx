import TrackedOutboundLink from '@/components/analytics/TrackedOutboundLink';
import Link from 'next/link';
import { CHROME_STORE_URL, SITE } from '@/content/site';
import styles from './Footer.module.css';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.brand}>
          <strong>{SITE.name}</strong>
          <p>{SITE.tagline}</p>
        </div>

        <div className={styles.links}>
          <div>
            <span className={styles.groupLabel}>Product</span>
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#who-its-for">Who it&apos;s for</a>
            <a href="#pricing">Pricing</a>
            <TrackedOutboundLink
              href={CHROME_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              ctaKind="install"
              location="footer"
            >
              Install extension
            </TrackedOutboundLink>
          </div>
          <div>
            <span className={styles.groupLabel}>Legal</span>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
          </div>
          <div>
            <span className={styles.groupLabel}>Contact</span>
            <a href="#contact">Contact form</a>
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
          </div>
        </div>
      </div>

      <div className={`container ${styles.bottom}`}>
        <p>© {year} {SITE.name}. All rights reserved.</p>
        <p className={styles.domain}>{SITE.domain}</p>
      </div>
    </footer>
  );
}
