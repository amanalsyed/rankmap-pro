'use client';

import { useState } from 'react';
import { FAQ } from '@/content/site';
import Reveal from './Reveal';
import SectionHeader from './SectionHeader';
import styles from './FAQ.module.css';

export default function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className={styles.section}>
      <div className="container">
        <Reveal>
          <SectionHeader label="FAQ" title="Common questions" />
        </Reveal>

        <div className={styles.list}>
          {FAQ.map((item, i) => (
            <Reveal key={item.q} delay={i * 60}>
              <div className={`${styles.item} ${open === i ? styles.open : ''}`}>
                <button
                  type="button"
                  className={styles.question}
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                >
                  {item.q}
                  <span className={styles.chevron} aria-hidden="true">
                    +
                  </span>
                </button>
                <div className={styles.answerWrap}>
                  <p className={styles.answer}>{item.a}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
