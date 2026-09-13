import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ProfileFeatureChartPoint } from '../profile-features';
import { PROFILE_FEATURES } from '../profile-features';

interface ProfileFeaturesChartProps {
  points: ProfileFeatureChartPoint[];
}

interface TooltipPayload {
  payload?: ProfileFeatureChartPoint;
}

function ProfileFeatureTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
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
        <span>Profile Features:</span>
        <strong>
          {point.score}/{point.maxScore}
        </strong>
      </div>
      <div className="local-scan-profile-tooltip-features-label">Features:</div>
      {point.present.length ? (
        <ul className="local-scan-profile-tooltip-list">
          {point.present.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      ) : (
        <p className="local-scan-profile-tooltip-empty">No profile features detected.</p>
      )}
    </div>
  );
}

export function ProfileFeaturesChart({ points }: ProfileFeaturesChartProps) {
  if (!points.length) {
    return <p className="local-scan-meta">No businesses to chart.</p>;
  }

  const maxRank = Math.max(...points.map((p) => p.rank));

  return (
    <div className="local-scan-profile-chart">
      <h3 className="local-scan-subheading">Business Rank vs Profile Features</h3>
      <div className="local-scan-profile-chart-wrap">
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={points} margin={{ top: 16, right: 20, left: 8, bottom: 28 }}>
            <defs>
              <linearGradient id="localScanProfileFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(79, 70, 229, 0.22)" />
                <stop offset="100%" stopColor="rgba(79, 70, 229, 0.02)" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="rank"
              type="number"
              domain={[1, maxRank]}
              ticks={points.map((p) => p.rank)}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--line-strong)' }}
              tickLine={{ stroke: 'var(--line-strong)' }}
              label={{
                value: 'Business Rank (1 = Top ranked)',
                position: 'insideBottom',
                offset: -12,
                fill: 'var(--text-muted)',
                fontSize: 12,
              }}
            />
            <YAxis
              domain={[0, PROFILE_FEATURES.length]}
              ticks={Array.from({ length: PROFILE_FEATURES.length + 1 }, (_, i) => i)}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--line-strong)' }}
              tickLine={{ stroke: 'var(--line-strong)' }}
              label={{
                value: 'Profile Features',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--text-muted)',
                fontSize: 12,
              }}
            />
            <Tooltip
              content={<ProfileFeatureTooltip />}
              cursor={{ stroke: 'var(--brand)', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area
              type="stepAfter"
              dataKey="score"
              stroke="var(--brand)"
              strokeWidth={2.5}
              fill="url(#localScanProfileFill)"
              dot={{
                r: 5,
                fill: 'var(--brand)',
                stroke: '#fff',
                strokeWidth: 2,
              }}
              activeDot={{
                r: 7,
                fill: 'var(--brand-hover)',
                stroke: '#fff',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
