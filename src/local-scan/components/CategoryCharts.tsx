import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CategoryCountBucket, CategoryRankPoint } from '../category-analytics';

function RankTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: CategoryRankPoint }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const point = payload[0].payload;
  return (
    <div className="local-scan-profile-tooltip">
      <div className="local-scan-profile-tooltip-title">{point.name}</div>
      <div className="local-scan-profile-tooltip-divider" />
      <div className="local-scan-profile-tooltip-row">
        <span>Rank:</span>
        <strong>{point.rank}</strong>
      </div>
      <div className="local-scan-profile-tooltip-row">
        <span>Categories:</span>
        <strong>{point.categoryCount}</strong>
      </div>
    </div>
  );
}

export function CategoryRankChart({ data }: { data: CategoryRankPoint[] }) {
  const maxRank = Math.max(...data.map((p) => p.rank), 1);
  const maxCategories = Math.max(...data.map((p) => p.categoryCount), 1);

  return (
    <div className="local-scan-category-chart">
      <h3 className="local-scan-subheading">Business Rank vs Number of Categories</h3>
      <div className="local-scan-category-chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="localScanCategoryRankFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(79, 70, 229, 0.24)" />
                <stop offset="100%" stopColor="rgba(79, 70, 229, 0.02)" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="rank"
              type="number"
              domain={[1, maxRank]}
              ticks={data.map((p) => p.rank)}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--line-strong)' }}
              tickLine={{ stroke: 'var(--line-strong)' }}
              label={{
                value: 'Business Rank (1 = Top ranked)',
                position: 'insideBottom',
                offset: -2,
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
            />
            <YAxis
              domain={[0, maxCategories]}
              allowDecimals={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--line-strong)' }}
              tickLine={{ stroke: 'var(--line-strong)' }}
              label={{
                value: 'Number of Categories',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
            />
            <Tooltip content={<RankTooltip />} cursor={{ stroke: 'var(--brand)', strokeDasharray: '4 4' }} />
            <Area
              type="monotone"
              dataKey="categoryCount"
              stroke="var(--brand)"
              strokeWidth={2}
              fill="url(#localScanCategoryRankFill)"
              dot={{ r: 4, fill: 'var(--brand)', stroke: '#fff', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: 'var(--brand-hover)', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function CategoryDistributionChart({ data }: { data: CategoryCountBucket[] }) {
  return (
    <div className="local-scan-category-chart">
      <h3 className="local-scan-subheading">Category Count Distribution</h3>
      <div className="local-scan-category-chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--line-strong)' }}
              tickLine={{ stroke: 'var(--line-strong)' }}
              label={{
                value: 'Number of Categories',
                position: 'insideBottom',
                offset: -2,
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--line-strong)' }}
              tickLine={{ stroke: 'var(--line-strong)' }}
              label={{
                value: 'Number of Businesses',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
            />
            <Tooltip
              formatter={(value) => [`${value ?? 0} businesses`, 'Count']}
              labelFormatter={(label) => `${label} categories`}
              contentStyle={{
                borderRadius: '10px',
                border: '1px solid var(--line)',
                fontSize: '12px',
              }}
            />
            <Bar dataKey="businesses" fill="var(--brand)" radius={[6, 6, 0, 0]} maxBarSize={42} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
