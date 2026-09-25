import Reveal from './Reveal';
import SectionHeader from './SectionHeader';
import styles from './DemoVideo.module.css';

const YOUTUBE_VIDEO_ID = 'deLzE40EG0A';

export default function DemoVideo() {
  return (
    <section id="demo" className={styles.section}>
      <div className="container">
        <Reveal>
          <SectionHeader
            label="Demo"
            title="See RankMap Pro in action"
            subtitle="Watch a quick walkthrough of lead scans, GBP audits, rank checks, and Local Scan on Google Maps."
          />
        </Reveal>

        <Reveal delay={100}>
          <div className={styles.inner}>
            <div className={styles.player}>
              <iframe
                src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?rel=0&modestbranding=1`}
                title="RankMap Pro extension demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
              />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
