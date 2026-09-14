import { CREEM_CHECKOUT_URL, EXTENSION_COMING_SOON, SITE } from '@/content/site';
import Reveal from './Reveal';
import styles from './InstallCTA.module.css';

export default function InstallCTA() {
  return (
    <section id="install" className={styles.section}>
      <Reveal>
        <div className={styles.card}>
          <div className={styles.glow} aria-hidden="true" />
          <div className={styles.content}>
            <span className={styles.badge}>Coming soon</span>
            <h2>Chrome extension launching on the Web Store</h2>
            <p>{EXTENSION_COMING_SOON}</p>
            <div className={styles.actions}>
              <a
                href={CREEM_CHECKOUT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                Get Lifetime Access — $19
              </a>
              <a href={`mailto:${SITE.email}`} className="btn btn-secondary">
                Contact us
              </a>
            </div>
            <ol className={styles.steps}>
              <li>Purchase Lifetime — secure checkout via Creem.io</li>
              <li>Receive your license key by email instantly</li>
              <li>Install from the Chrome Web Store when we launch, then activate your key</li>
            </ol>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
