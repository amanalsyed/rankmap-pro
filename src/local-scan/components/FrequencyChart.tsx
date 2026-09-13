import type { StringFrequency } from '../aggregate';

interface FrequencyChartProps {
  title: string;
  items: StringFrequency[];
  maxItems?: number;
}

export function FrequencyChart({ title, items, maxItems = 12 }: FrequencyChartProps) {
  const visible = items.slice(0, maxItems);
  const maxCount = visible[0]?.count ?? 1;

  if (!visible.length) {
    return <p className="local-scan-meta">No data for {title.toLowerCase()}.</p>;
  }

  return (
    <div className="local-scan-chart">
      <h3 className="local-scan-subheading">{title}</h3>
      <div className="local-scan-chart-bars">
        {visible.map((item) => (
          <div key={item.name} className="local-scan-chart-row">
            <div className="local-scan-chart-label" title={item.name}>
              {item.name}
            </div>
            <div className="local-scan-chart-track">
              <div
                className="local-scan-chart-fill"
                style={{ width: `${Math.max(8, (item.count / maxCount) * 100)}%` }}
              />
            </div>
            <div className="local-scan-chart-value">
              {item.count} <span>({item.share}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
