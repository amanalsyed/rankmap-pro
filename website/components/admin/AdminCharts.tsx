'use client';

import styles from './AdminDashboard.module.css';

interface DayPoint {
  date: string;
  count: number;
}

interface AdminChartsProps {
  signupsByDay: DayPoint[];
  activityByDay: DayPoint[];
}

function MiniBarChart({ title, data, color }: { title: string; data: DayPoint[]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className={styles.chartPanel}>
      <h3 className={styles.chartTitle}>{title}</h3>
      <div className={styles.chartBars}>
        {data.map((d) => (
          <div key={d.date} className={styles.chartBarWrap} title={`${d.date}: ${d.count}`}>
            <div
              className={styles.chartBar}
              style={{ height: `${Math.max(4, (d.count / max) * 100)}%`, background: color }}
            />
            <span className={styles.chartBarLabel}>{d.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminCharts({ signupsByDay, activityByDay }: AdminChartsProps) {
  return (
    <div className={styles.chartGrid}>
      <MiniBarChart title="Signups (30 days)" data={signupsByDay} color="#4f46e5" />
      <MiniBarChart title="Activity events (30 days)" data={activityByDay} color="#059669" />
    </div>
  );
}
