import type { CSSProperties } from 'react';
import { AUDIENCES } from '@/content/site';
import Reveal from './Reveal';
import SectionHeader from './SectionHeader';
import styles from './WhoIsItFor.module.css';

export default function WhoIsItFor() {
  return (
    <section id="who-its-for" className={styles.section}>
      <div className={styles.bgAccent} aria-hidden="true" />
      <div className="container">
        <Reveal>
          <SectionHeader
            label="Who it's for"
            title="Built for people who sell to local businesses"
            subtitle="Whether you build websites, run local SEO, or fill a sales pipeline — RankMap Pro lives on Google Maps so you can find, qualify, and close without switching tabs."
          />
        </Reveal>

        <div className={styles.grid}>
          {AUDIENCES.map((audience, i) => (
            <Reveal key={audience.id} delay={i * 80}>
              <article
                className={styles.card}
                style={{ '--accent': audience.accent } as CSSProperties}
              >
                <div className={styles.iconWrap}>
                  <span aria-hidden="true">{audience.icon}</span>
                </div>
                <h3>{audience.title}</h3>
                <p className={styles.description}>{audience.description}</p>
                <ul className={styles.bullets}>
                  {audience.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
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
