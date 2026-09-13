import { useMemo, useState } from 'react';
import type { LocalScanBusiness, LocalScanSession } from '../types';
import {
  analyzeBusinessHours,
  analyzeDayHours,
  copyBusinessHoursList,
  copyHoursPatterns,
  HOURS_DAY_OPTIONS,
  resolveHoursDayLabel,
  type HoursDayKey,
} from '../hours-analytics';
import { HoursComparisonChart, HoursDistributionChart } from './HoursCharts';

function HoursStatCard({
  value,
  label,
  hint,
}: {
  value: string | number;
  label: string;
  hint?: string;
}) {
  return (
    <div className="local-scan-hours-stat">
      <div className="local-scan-hours-stat-value">{value}</div>
      <div className="local-scan-hours-stat-label">{label}</div>
      {hint ? <div className="local-scan-hours-stat-hint">{hint}</div> : null}
    </div>
  );
}

function CopyButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="btn-secondary local-scan-hours-copy-btn"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}

export default function HoursTab({
  businesses,
  mode,
}: {
  businesses: LocalScanBusiness[];
  mode: LocalScanSession['mode'];
}) {
  const [dayKey, setDayKey] = useState<HoursDayKey>('present');

  const analyses = useMemo(() => businesses.map(analyzeBusinessHours), [businesses]);
  const dayAnalytics = useMemo(
    () => analyzeDayHours(analyses, dayKey, businesses.length),
    [analyses, dayKey, businesses.length]
  );

  const selectedDayLabel = resolveHoursDayLabel(dayKey);
  const businessCopyText = copyBusinessHoursList(dayAnalytics.businessRows);
  const patternCopyText = copyHoursPatterns(dayAnalytics.patterns, businesses.length);

  return (
    <>
      {mode !== 'deep' ? (
        <p className="local-scan-meta local-scan-section-gap">
          Hours data is collected during <strong>Deep Scan</strong>. Run a deep scan to populate
          opening hours for each listing.
        </p>
      ) : null}

      <div className="local-scan-hours-day-tabs">
        {HOURS_DAY_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`local-scan-hours-day-tab${dayKey === option.key ? ' is-active' : ''}`}
            onClick={() => setDayKey(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="local-scan-hours-stats">
        <HoursStatCard value={dayAnalytics.summary.withTiming} label="Business with Timing" />
        <HoursStatCard value={dayAnalytics.summary.noTiming} label="Businesses with no timing" />
        <HoursStatCard value={dayAnalytics.summary.open24Count} label="24 Hour Operations" />
        <HoursStatCard value={dayAnalytics.summary.closedCount} label="Closed" />
        <HoursStatCard value={dayAnalytics.summary.uniquePatterns} label="Unique Patterns" />
        <HoursStatCard
          value={dayAnalytics.summary.earliestOpen ?? '—'}
          label="Earliest Opening"
          hint="Excludes 24/7 businesses"
        />
        <HoursStatCard
          value={dayAnalytics.summary.latestClose ?? '—'}
          label="Latest Closing"
          hint="Excludes 24/7 businesses"
        />
      </div>

      <div className="local-scan-hours-layout">
        <div className="local-scan-hours-charts-col">
          <HoursDistributionChart data={dayAnalytics.hourlyDistribution} />
          <HoursComparisonChart data={dayAnalytics.comparisonPoints} />
        </div>

        <div className="local-scan-hours-lists-col">
          <section className="local-scan-hours-panel">
            <div className="local-scan-hours-panel-header">
              <h3 className="local-scan-subheading">Businesses</h3>
              <CopyButton label="Copy all" text={businessCopyText} />
            </div>
            <div className="local-scan-hours-list">
              {dayAnalytics.businessRows.map((row) => (
                <div key={row.placeId} className="local-scan-hours-business-card">
                  <span className="local-scan-hours-rank">{row.rank}</span>
                  <div className="local-scan-hours-business-body">
                    <div className="local-scan-hours-business-name">{row.name}</div>
                    <div className="local-scan-hours-business-hours">{row.dayHours}</div>
                    <div className="local-scan-hours-business-meta">
                      {selectedDayLabel} ·{' '}
                      {row.weeklyHours != null ? `${row.weeklyHours} hrs/week` : 'Weekly hours unavailable'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="local-scan-hours-panel">
            <div className="local-scan-hours-panel-header">
              <h3 className="local-scan-subheading">Hours Pattern</h3>
              <CopyButton label="Copy all" text={patternCopyText} />
            </div>
            <div className="local-scan-hours-pattern-list">
              {dayAnalytics.patterns.map((pattern) => (
                <div key={pattern.pattern} className="local-scan-hours-pattern-card">
                  <div className="local-scan-hours-pattern-top">
                    <div className="local-scan-hours-pattern-label">{pattern.pattern}</div>
                    <div className="local-scan-hours-pattern-share">{pattern.share.toFixed(1)}%</div>
                  </div>
                  <div className="local-scan-hours-pattern-meta">
                    {pattern.count}/{businesses.length} · ranks {pattern.ranks.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
