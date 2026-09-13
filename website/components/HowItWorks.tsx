import { STEPS } from '@/content/site';
import Reveal from './Reveal';
import SectionHeader from './SectionHeader';
import styles from './HowItWorks.module.css';

export default function HowItWorks() {
  return (
    <section id="how-it-works" className={styles.section}>
      <div className={styles.bgAccent} aria-hidden="true" />
      <div className="container">
        <Reveal>
          <SectionHeader
            label="How it works"
            title="Up and running in minutes"
            subtitle="No onboarding calls. No complex setup. Install the Chrome extension, sign in, and start working on Google Maps."
          />
        </Reveal>

        <div className={styles.steps}>
          {STEPS.map((step, i) => (
            <Reveal key={step.step} delay={i * 100}>
              <article className={styles.step}>
                <div className={styles.stepNum}>{step.step}</div>
                <div className={styles.stepLine} aria-hidden="true" />
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
