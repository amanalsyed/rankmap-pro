import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface HoursDistributionChartProps {
  data: Array<{ hour: number; label: string; count: number }>;
}

export function HoursDistributionChart({ data }: HoursDistributionChartProps) {
  return (
    <div className="local-scan-hours-chart">
      <h3 className="local-scan-subheading">Business Hours Distribution Throughout the Day</h3>
      <div className="local-scan-hours-chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="localScanHoursDistributionFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(79, 70, 229, 0.24)" />
                <stop offset="100%" stopColor="rgba(79, 70, 229, 0.02)" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              axisLine={{ stroke: 'var(--line-strong)' }}
              tickLine={{ stroke: 'var(--line-strong)' }}
              interval={3}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--line-strong)' }}
              tickLine={{ stroke: 'var(--line-strong)' }}
              label={{
                value: 'Businesses Open',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
            />
            <Tooltip
              formatter={(value) => [`${value ?? 0} open`, 'Businesses']}
              labelFormatter={(label) => `Hour ${label}`}
              contentStyle={{
                borderRadius: '10px',
                border: '1px solid var(--line)',
                fontSize: '12px',
              }}
            />
            <Area
              type="stepAfter"
              dataKey="count"
              stroke="var(--brand)"
              strokeWidth={2}
              fill="url(#localScanHoursDistributionFill)"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--brand)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface HoursComparisonChartProps {
  data: Array<{ rank: number; name: string; hours: number }>;
}

function ComparisonTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { rank: number; name: string; hours: number } }>;
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
        <span>Hours open:</span>
        <strong>{point.hours}h</strong>
      </div>
    </div>
  );
}

export function HoursComparisonChart({ data }: HoursComparisonChartProps) {
  return (
    <div className="local-scan-hours-chart">
      <h3 className="local-scan-subheading">Business Hours Comparison</h3>
      <div className="local-scan-hours-chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="localScanHoursComparisonFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(79, 70, 229, 0.18)" />
                <stop offset="100%" stopColor="rgba(79, 70, 229, 0.02)" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="rank"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--line-strong)' }}
              tickLine={{ stroke: 'var(--line-strong)' }}
              label={{
                value: 'Business Rank',
                position: 'insideBottom',
                offset: -2,
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
            />
            <YAxis
              domain={[0, 25]}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--line-strong)' }}
              tickLine={{ stroke: 'var(--line-strong)' }}
              label={{
                value: 'Hours',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
            />
            <Tooltip content={<ComparisonTooltip />} cursor={{ stroke: 'var(--brand)', strokeDasharray: '4 4' }} />
            <Area
              type="monotone"
              dataKey="hours"
              stroke="var(--brand)"
              strokeWidth={2}
              fill="url(#localScanHoursComparisonFill)"
              dot={{ r: 4, fill: 'var(--brand)', stroke: '#fff', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: 'var(--brand-hover)', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
