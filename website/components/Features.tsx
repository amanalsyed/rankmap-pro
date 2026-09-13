import type { CSSProperties } from 'react';
import { FEATURE_GROUPS } from '@/content/site';
import Reveal from './Reveal';
import SectionHeader from './SectionHeader';
import styles from './Features.module.css';

export default function Features() {
  return (
    <section id="features" className={styles.section}>
      <div className="container">
        <Reveal>
          <SectionHeader
            label="Features"
            title="Everything built into one extension"
            subtitle="Eight toolsets that run directly on Google Maps — lead finding, scoring, enrichment, audits, rank checks, competitive scans, exports, and agency workflow."
          />
        </Reveal>

        <div className={styles.groups}>
          {FEATURE_GROUPS.map((group, i) => (
            <Reveal key={group.id} delay={i * 60}>
              <article
                className={styles.group}
                style={{ '--accent': group.accent } as CSSProperties}
              >
                <div className={styles.groupHead}>
                  <div className={styles.iconWrap}>
                    <span aria-hidden="true">{group.icon}</span>
                  </div>
                  <div>
                    <h3>{group.title}</h3>
                    <p className={styles.summary}>{group.summary}</p>
                  </div>
                </div>
                <ul className={styles.itemList}>
                  {group.items.map((item) => (
                    <li key={item}>
                      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
                <div className={styles.cardGlow} aria-hidden="true" />
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
