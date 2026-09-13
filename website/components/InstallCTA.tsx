import { SITE } from '@/content/site';
import Reveal from './Reveal';
import styles from './InstallCTA.module.css';

export default function InstallCTA() {
  return (
    <section id="install" className={styles.section}>
      <Reveal>
        <div className={styles.card}>
          <div className={styles.glow} aria-hidden="true" />
          <div className={styles.content}>
            <h2>Ready to find your next local SEO client?</h2>
            <p>
              Install RankMap Pro on Chrome, sign in, and start scanning Google Maps in under a
              minute.
            </p>
            <div className={styles.actions}>
              <a href="#" className="btn btn-primary">
                Add to Chrome
              </a>
              <a href={`mailto:${SITE.email}`} className="btn btn-secondary">
                Contact us
              </a>
            </div>
            <ol className={styles.steps}>
              <li>Open Chrome → Extensions → Developer mode</li>
              <li>Load unpacked → select the extension folder</li>
              <li>Or install from Chrome Web Store when published</li>
            </ol>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
