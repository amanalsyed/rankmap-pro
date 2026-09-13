import { useEffect, useMemo, useRef, useState } from 'react';
import {
  aggregateAttributeFrequency,
  aggregateReviewStats,
  aggregateServiceFrequency,
  copyTextList,
  formatDistanceKm,
} from './aggregate';
import { compareLocalScanSessions } from './compare';
import CategoriesTab from './components/CategoriesTab';
import { FrequencyChart } from './components/FrequencyChart';
import HoursTab from './components/HoursTab';
import { LocationMap } from './components/LocationMap';
import {
  businessLocationLabel,
  businessesWithCoordinates,
  isServiceAreaBusiness,
  sortBusinessesByRank,
} from './location-utils';
import { downloadLocalScanCsv, downloadLocalScanJson } from './export';
import HistoryPage from './HistoryPage';
import { ProfileFeaturesChart } from './components/ProfileFeaturesChart';
import { miscFieldsForBusiness } from './misc-fields';
import {
  aggregateProfileFeatureStats,
  profileFeatureChartPoints,
} from './profile-features';
import { localScanHistoryUrl } from './open-local-scan';
import { downloadLocalScanPdf } from './pdf-export';
import { usePlanCapabilities } from '../hooks/usePlanCapabilities';
import {
  emptyLocalScanBusiness,
  type LocalScanBusiness,
  type LocalScanSession,
  type Search3PackEntry,
} from './types';

type TabId =
  | 'overview'
  | 'categories'
  | 'reviews'
  | 'location'
  | 'services'
  | 'hours'
  | 'attributes'
  | 'misc'
  | 'compare'
  | 'search3pack';

function pageView(): 'history' | 'report' {
  return new URLSearchParams(window.location.search).get('view') === 'history' ? 'history' : 'report';
}
function sessionIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('id');
}

function deepOnlyFromUrl(): boolean {
  return new URLSearchParams(window.location.search).get('deepOnly') === '1';
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function normalizeBusiness(raw: LocalScanBusiness): LocalScanBusiness {
  return emptyLocalScanBusiness({
    ...raw,
    website: raw.website ?? '',
    services: raw.services ?? [],
    attributes: raw.attributes ?? [],
    hours: raw.hours ?? '',
    specialHours: raw.specialHours ?? '',
    bookingLink: raw.bookingLink ?? '',
    gbpScore: raw.gbpScore ?? null,
    claimed: raw.claimed ?? null,
    businessStatus: raw.businessStatus ?? '',
    hasPhotos: raw.hasPhotos ?? null,
    hasPosts: raw.hasPosts ?? null,
    deepScraped: raw.deepScraped ?? false,
    placeIdChij: raw.placeIdChij ?? '',
    cid: raw.cid ?? null,
    hexFid: raw.hexFid ?? '',
    knowledgeGraphId: raw.knowledgeGraphId ?? '',
    businessProfileId: raw.businessProfileId ?? null,
    plusCode: raw.plusCode ?? '',
    negativeReviewCount: raw.negativeReviewCount ?? null,
    photoCount: raw.photoCount ?? null,
    postCount: raw.postCount ?? null,
    latestPhotoDate: raw.latestPhotoDate ?? '',
    latestPostDate: raw.latestPostDate ?? '',
    serviceAreas: raw.serviceAreas ?? [],
  });
}
function normalizeSession(raw: LocalScanSession): LocalScanSession {
  return {
    ...raw,
    mode: raw.mode ?? 'quick',
    businesses: (raw.businesses ?? []).map(normalizeBusiness),
  };
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="local-scan-stat">
      <div className="local-scan-stat-label">{label}</div>
      <div className="local-scan-stat-value">{value}</div>
    </div>
  );
}

function DeepOnlyNotice({ mode }: { mode: LocalScanSession['mode'] }) {
  if (mode === 'deep') return null;
  return (
    <p className="local-scan-deep-notice">
      This section needs a <strong>Deep Scan</strong> from Google Maps. Quick Scan only reads
      listing cards and bulk category data.
    </p>
  );
}

function CopyButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="btn-secondary local-scan-copy-btn"
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

function OverviewTab({ businesses }: { businesses: LocalScanBusiness[] }) {
  return (
    <div className="local-scan-table-wrap">
      <table className="local-scan-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Business</th>
            <th>Category</th>
            <th>Rating</th>
            <th>Reviews</th>
            <th>Website</th>
            <th>GBP score</th>
            <th>Distance</th>
          </tr>
        </thead>
        <tbody>
          {businesses.map((business) => (
            <tr key={business.placeId}>
              <td className="local-scan-rank">{business.rank}</td>
              <td>
                <div>{business.name}</div>
                {business.mapsUrl ? (
                  <a
                    className="local-scan-link"
                    href={business.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open on Maps
                  </a>
                ) : null}
              </td>
              <td>{business.primaryCategory || '—'}</td>
              <td>{business.rating ?? '—'}</td>
              <td>{business.reviewCount ?? '—'}</td>
              <td className={business.hasWebsite ? 'website-yes' : 'website-no'}>
                {business.hasWebsite ? 'Yes' : 'No'}
              </td>
              <td>{business.gbpScore ?? '—'}</td>
              <td>{formatDistanceKm(business.distanceKm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewsTab({ businesses }: { businesses: LocalScanBusiness[] }) {
  const stats = useMemo(() => aggregateReviewStats(businesses), [businesses]);

  return (
    <>
      <div className="local-scan-stats">
        <StatCard label="Avg rating" value={stats.avgRating ?? '—'} />
        <StatCard label="Avg reviews" value={stats.avgReviews ?? '—'} />
        <StatCard label="Highest reviews" value={stats.maxReviews ?? '—'} />
        <StatCard label="Lowest reviews" value={stats.minReviews ?? '—'} />
      </div>

      <div className="local-scan-table-wrap">
        <table className="local-scan-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Business</th>
              <th>Rating</th>
              <th>Reviews</th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((business) => (
              <tr key={business.placeId}>
                <td className="local-scan-rank">{business.rank}</td>
                <td>{business.name}</td>
                <td>{business.rating ?? '—'}</td>
                <td>{business.reviewCount ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LocationTab({
  businesses,
  centerLat,
  centerLng,
}: {
  businesses: LocalScanBusiness[];
  centerLat: number | null;
  centerLng: number | null;
}) {
  const sorted = useMemo(() => sortBusinessesByRank(businesses), [businesses]);
  const withCoords = useMemo(() => businessesWithCoordinates(businesses), [businesses]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(sorted[0]?.placeId ?? null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!selectedPlaceId) return;
    cardRefs.current[selectedPlaceId]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedPlaceId]);

  const withDistance = businesses.filter((b) => b.distanceKm != null);

  return (
    <>
      <div className="local-scan-stats">
        <StatCard
          label="Search center"
          value={
            centerLat != null && centerLng != null
              ? `${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}`
              : 'Unavailable'
          }
        />
        <StatCard label="On map" value={withCoords.length} />
        <StatCard
          label="Closest listing"
          value={
            withDistance.length
              ? formatDistanceKm(
                  [...withDistance].sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))[0]
                    .distanceKm
                )
              : '—'
          }
        />
      </div>

      <div className="local-scan-location-layout">
        <div className="local-scan-location-map-col">
          <h3 className="local-scan-subheading">Business Locations Map</h3>
          <LocationMap
            businesses={businesses}
            centerLat={centerLat}
            centerLng={centerLng}
            selectedPlaceId={selectedPlaceId}
            onSelect={setSelectedPlaceId}
          />
          <ul className="local-scan-map-legend">
            <li>
              <span className="local-scan-legend-icon local-scan-legend-icon-center" aria-hidden="true" />
              Map center when search ran
            </li>
            <li>
              <span className="local-scan-legend-icon local-scan-legend-icon-pin" aria-hidden="true" />
              Location of businesses with rank
            </li>
            <li>
              <span className="local-scan-legend-tag">SAB</span>
              Service Area Business — centroid of service area (may appear away from street address)
            </li>
          </ul>
        </div>

        <div className="local-scan-location-list-col">
          <h3 className="local-scan-subheading">Businesses</h3>
          <div className="local-scan-location-list" ref={listRef}>
            {sorted.map((business) => {
              const sab = isServiceAreaBusiness(business);
              const selected = selectedPlaceId === business.placeId;
              const hasCoords = business.lat != null && business.lng != null;

              return (
                <button
                  key={business.placeId}
                  type="button"
                  ref={(node) => {
                    cardRefs.current[business.placeId] = node;
                  }}
                  className={`local-scan-location-card${selected ? ' is-selected' : ''}${
                    !hasCoords ? ' is-missing-coords' : ''
                  }`}
                  onClick={() => setSelectedPlaceId(business.placeId)}
                >
                  <span className="local-scan-location-rank">{business.rank}</span>
                  <div className="local-scan-location-card-body">
                    <div className="local-scan-location-card-title">
                      {business.name}
                      {sab ? <span className="local-scan-location-sab">[SAB]</span> : null}
                    </div>
                    <div className="local-scan-location-card-address">
                      {businessLocationLabel(business)}
                    </div>
                    {business.distanceKm != null ? (
                      <div className="local-scan-location-card-meta">
                        {formatDistanceKm(business.distanceKm)} from search center
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function ServicesTab({
  businesses,
  mode,
}: {
  businesses: LocalScanBusiness[];
  mode: LocalScanSession['mode'];
}) {
  const freq = useMemo(() => aggregateServiceFrequency(businesses), [businesses]);
  const allServices = useMemo(
    () => [...new Set(businesses.flatMap((b) => b.services))].sort(),
    [businesses]
  );
  const deepCount = businesses.filter((b) => b.deepScraped).length;

  return (
    <>
      <DeepOnlyNotice mode={mode} />
      <div className="local-scan-stats">
        <StatCard label="Unique services" value={freq.length} />
        <StatCard label="Profiles scraped" value={deepCount} />
      </div>

      {allServices.length > 0 ? (
        <div className="local-scan-actions local-scan-section-gap">
          <CopyButton label="Copy all services" text={copyTextList(allServices)} />
        </div>
      ) : null}

      {freq.length > 0 ? (
        <>
          <FrequencyChart title="Service frequency" items={freq} />
          <div className="local-scan-chip-list local-scan-section-gap">            {freq.map((item) => (
              <span key={item.name} className="local-scan-chip">
                {item.name} <strong>{item.count}</strong> ({item.share}%)
              </span>
            ))}
          </div>
        </>
      ) : null}

      <div className="local-scan-table-wrap">
        <table className="local-scan-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Business</th>
              <th>Services</th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((business) => (
              <tr key={business.placeId}>
                <td className="local-scan-rank">{business.rank}</td>
                <td>{business.name}</td>
                <td>{business.services.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AttributesTab({
  businesses,
  mode,
}: {
  businesses: LocalScanBusiness[];
  mode: LocalScanSession['mode'];
}) {
  const freq = useMemo(() => aggregateAttributeFrequency(businesses), [businesses]);
  const allAttributes = useMemo(
    () => [...new Set(businesses.flatMap((b) => b.attributes))].sort(),
    [businesses]
  );

  return (
    <>
      <DeepOnlyNotice mode={mode} />
      <div className="local-scan-stats">
        <StatCard label="Unique attributes" value={freq.length} />
      </div>

      {allAttributes.length > 0 ? (
        <div className="local-scan-actions local-scan-section-gap">
          <CopyButton label="Copy all attributes" text={copyTextList(allAttributes)} />
        </div>
      ) : null}

      {freq.length > 0 ? (
        <>
          <FrequencyChart title="Attribute frequency" items={freq} />
          <div className="local-scan-chip-list local-scan-section-gap">            {freq.map((item) => (
              <span key={item.name} className="local-scan-chip">
                {item.name} <strong>{item.count}</strong> ({item.share}%)
              </span>
            ))}
          </div>
        </>
      ) : null}

      <div className="local-scan-table-wrap">
        <table className="local-scan-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Business</th>
              <th>Attributes</th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((business) => (
              <tr key={business.placeId}>
                <td className="local-scan-rank">{business.rank}</td>
                <td>{business.name}</td>
                <td>{business.attributes.join('; ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MiscStatCard({
  count,
  label,
  share,
}: {
  count: number;
  label: string;
  share: number;
}) {
  return (
    <div className="local-scan-misc-stat">
      <div className="local-scan-misc-stat-value">{count}</div>
      <div className="local-scan-misc-stat-label">{label}</div>
      <div className="local-scan-misc-stat-share">{share.toFixed(1)}%</div>
    </div>
  );
}

function MiscTab({
  businesses,
  mode,
}: {
  businesses: LocalScanBusiness[];
  mode: LocalScanSession['mode'];
}) {
  const [showAllFields, setShowAllFields] = useState(false);
  const stats = useMemo(() => aggregateProfileFeatureStats(businesses), [businesses]);
  const chartPoints = useMemo(() => profileFeatureChartPoints(businesses), [businesses]);
  const fields = businesses[0] ? miscFieldsForBusiness(businesses[0]) : [];

  return (
    <>
      {mode !== 'deep' ? (
        <p className="local-scan-meta local-scan-section-gap">
          Profile feature scores use listing-card data. Run a <strong>Deep Scan</strong> for richer
          appointment and claim-status signals.
        </p>
      ) : null}

      <div className="local-scan-misc-stats">
        {stats.map((stat) => (
          <MiscStatCard key={stat.id} count={stat.count} label={stat.label} share={stat.share} />
        ))}
      </div>

      <ProfileFeaturesChart points={chartPoints} />

      <div className="local-scan-misc-expand">
        <button
          type="button"
          className="btn-secondary local-scan-misc-expand-btn"
          onClick={() => setShowAllFields((open) => !open)}
        >
          {showAllFields ? 'Hide all profile fields' : 'Show all profile fields'}
        </button>
      </div>

      {showAllFields ? (
        <div className="local-scan-table-wrap local-scan-misc-wrap local-scan-section-gap">
          <table className="local-scan-table local-scan-misc-table">
            <thead>
              <tr>
                <th>Field</th>
                {businesses.map((business) => (
                  <th key={business.placeId}>
                    #{business.rank} {business.name.slice(0, 24)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.id}>
                  <td>{field.label}</td>
                  {businesses.map((business) => {
                    const row = miscFieldsForBusiness(business).find((f) => f.id === field.id);
                    return <td key={business.placeId}>{row?.value ?? '—'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

function CompareTab({
  session,
  allSessions,
}: {
  session: LocalScanSession;
  allSessions: LocalScanSession[];
}) {
  const others = allSessions.filter((s) => s.id !== session.id);
  const [otherId, setOtherId] = useState(others[0]?.id ?? '');
  const comparison = useMemo(() => {
    const other = others.find((s) => s.id === otherId);
    if (!other) return null;
    return compareLocalScanSessions(session, other);
  }, [session, others, otherId]);

  if (!others.length) {
    return <p className="local-scan-meta">Save another Local Scan to compare against this one.</p>;
  }

  return (
    <>
      <div className="local-scan-compare-picker">
        <label>
          Compare with
          <select value={otherId} onChange={(e) => setOtherId(e.target.value)}>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.context.keyword} · {formatDate(s.createdAt)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {comparison ? (
        <>
          <div className="local-scan-stats">
            <StatCard label="Shared listings" value={comparison.sharedNames.length} />
            <StatCard label="Only in this scan" value={comparison.onlyInA.length} />
            <StatCard label="Only in other scan" value={comparison.onlyInB.length} />
            <StatCard
              label="Avg rating delta"
              value={
                comparison.statsA.avgRating != null && comparison.statsB.avgRating != null
                  ? Math.round((comparison.statsB.avgRating - comparison.statsA.avgRating) * 10) / 10
                  : '—'
              }
            />
          </div>
          {comparison.rankChanges.length ? (
            <div className="local-scan-table-wrap">
              <table className="local-scan-table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>This scan</th>
                    <th>Other scan</th>
                    <th>Rank change</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rankChanges.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.rankA ?? '—'}</td>
                      <td>{row.rankB ?? '—'}</td>
                      <td>{row.delta ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function Search3PackTab({
  session,
  onRefresh,
  loading,
}: {
  session: LocalScanSession;
  onRefresh: () => void;
  loading: boolean;
}) {
  const entries = session.search3Pack ?? [];
  const mapsNames = new Set(session.businesses.map((b) => b.name.toLowerCase()));

  return (
    <>
      <p className="local-scan-meta local-scan-section-gap">
        Google Search local 3-pack for <strong>{session.context.keyword}</strong>. Compare Maps pack
        rankings with organic local results.
      </p>
      <div className="local-scan-actions local-scan-section-gap">
        <button type="button" className="btn-secondary" onClick={onRefresh} disabled={loading}>
          {loading ? 'Fetching…' : 'Refresh 3-pack'}
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="local-scan-meta">No Search 3-pack data yet. Click refresh to fetch it.</p>
      ) : (
        <div className="local-scan-table-wrap">
          <table className="local-scan-table">
            <thead>
              <tr>
                <th>Search rank</th>
                <th>Business</th>
                <th>Category</th>
                <th>Rating</th>
                <th>Reviews</th>
                <th>In Maps scan?</th>
                <th>Maps URL</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry: Search3PackEntry) => (
                <tr key={`${entry.rank}-${entry.name}`}>
                  <td>{entry.rank}</td>
                  <td>{entry.name}</td>
                  <td>{entry.category || '—'}</td>
                  <td>{entry.rating ?? '—'}</td>
                  <td>{entry.reviewCount ?? '—'}</td>
                  <td>{mapsNames.has(entry.name.toLowerCase()) ? 'Yes' : 'No'}</td>
                  <td>
                    <a className="local-scan-link" href={entry.mapsUrl} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
export default function App() {
  if (pageView() === 'history') {
    return <HistoryPage />;
  }

  return <ReportApp />;
}

function ReportApp() {
  const { plan } = usePlanCapabilities();
  const [session, setSession] = useState<LocalScanSession | null>(null);
  const [fullSession, setFullSession] = useState<LocalScanSession | null>(null);
  const [deepOnlyView, setDeepOnlyView] = useState(false);
  const [allSessions, setAllSessions] = useState<LocalScanSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabId>('overview');
  const [fetching3Pack, setFetching3Pack] = useState(false);

  useEffect(() => {
    const sessionId = sessionIdFromUrl();
    if (!sessionId) {
      setError('Missing Local Scan session id.');
      setLoading(false);
      return;
    }

    Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_LOCAL_SCAN', sessionId }),
      chrome.runtime.sendMessage({ type: 'LIST_LOCAL_SCANS' }),
    ])
      .then(([scanRes, listRes]: [{ session?: LocalScanSession | null }, { sessions?: LocalScanSession[] }]) => {
        if (!scanRes?.session) {
          setError('Local Scan session not found.');
          return;
        }
        const normalized = normalizeSession(scanRes.session);
        setFullSession(normalized);

        const showDeepOnly = deepOnlyFromUrl();
        const deepBusinesses = normalized.businesses.filter((b) => b.deepScraped);
        const useDeepOnly =
          showDeepOnly &&
          normalized.mode === 'deep' &&
          deepBusinesses.length > 0 &&
          deepBusinesses.length < normalized.businesses.length;

        setDeepOnlyView(useDeepOnly);
        setSession(
          useDeepOnly ? { ...normalized, businesses: deepBusinesses } : normalized
        );
        setAllSessions((listRes?.sessions ?? []).map(normalizeSession));
      })
      .catch(() => setError('Could not load Local Scan session.'))
      .finally(() => setLoading(false));
  }, []);

  const refresh3Pack = () => {
    if (!session) return;
    setFetching3Pack(true);
    void chrome.runtime
      .sendMessage({ type: 'FETCH_SEARCH_3PACK', keyword: session.context.keyword })
      .then((res: { entries?: Search3PackEntry[] }) => {
        const entries = res?.entries ?? [];
        if (!entries.length) return;
        const updated = { ...session, search3Pack: entries };
        setSession(updated);
        void chrome.runtime.sendMessage({ type: 'LOCAL_SCAN_UPDATE', session: updated });
      })
      .finally(() => setFetching3Pack(false));
  };

  const tabs: Array<{ id: TabId; label: string; deep?: boolean }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'categories', label: 'Categories' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'location', label: 'Location' },
    { id: 'search3pack', label: 'Search 3-pack' },
    { id: 'compare', label: 'Compare' },
    { id: 'services', label: 'Services', deep: true },
    { id: 'hours', label: 'Hours' },
    { id: 'attributes', label: 'Attributes', deep: true },
    { id: 'misc', label: 'Misc' },
  ];
  if (loading) {
    return <div className="local-scan-page local-scan-loading">Loading Local Scan…</div>;
  }

  if (error || !session) {
    return <div className="local-scan-page local-scan-error">{error || 'Session not found.'}</div>;
  }

  const modeLabel = session.mode === 'deep' ? 'Deep scan' : 'Quick scan';
  const deepScrapedCount = session.businesses.filter((b) => b.deepScraped).length;
  const skippedQuickCount =
    deepOnlyView && fullSession
      ? fullSession.businesses.length - fullSession.businesses.filter((b) => b.deepScraped).length
      : 0;

  const showFullReport = () => {
    if (!fullSession) return;
    setDeepOnlyView(false);
    setSession(fullSession);
    const url = new URL(window.location.href);
    url.searchParams.delete('deepOnly');
    window.history.replaceState(null, '', url.toString());
  };

  return (
    <div className="local-scan-page">
      {deepOnlyView && skippedQuickCount > 0 ? (
        <div
          className="local-scan-deep-notice"
          style={{
            margin: '0 0 16px',
            padding: '12px 16px',
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '8px',
            color: '#856404',
          }}
        >
          Showing <strong>{session.businesses.length}</strong> deep-scanned profile
          {session.businesses.length === 1 ? '' : 's'}.{' '}
          <strong>{skippedQuickCount}</strong> other listing
          {skippedQuickCount === 1 ? '' : 's'} used quick-scan data only (free plan limit).{' '}
          <button type="button" className="btn-link" onClick={showFullReport}>
            View all {fullSession?.businesses.length} listings
          </button>
        </div>
      ) : null}
      <header className="local-scan-header">
        <div>
          <h1>
            Local Scan
            <span className={`local-scan-badge${session.mode === 'deep' ? ' is-deep' : ''}`}>
              {modeLabel}
            </span>
          </h1>
          <p className="local-scan-meta">
            {session.context.keyword} · {session.businesses.length} businesses
            {session.mode === 'deep'
              ? ` · ${deepScrapedCount} fully scraped`
              : ''}{' '}
            · {formatDate(session.createdAt)}
            {session.fromCache ? (
              <>
                {' '}
                <span className="local-scan-badge">Cached</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="local-scan-actions">
          <button type="button" className="btn-secondary" onClick={() => downloadLocalScanCsv(session)}>
            Export CSV
          </button>
          <button type="button" className="btn-secondary" onClick={() => downloadLocalScanJson(session)}>
            Export JSON
          </button>
          <button type="button" className="btn-secondary" onClick={() => downloadLocalScanPdf(session)}>
            Export PDF
          </button>
          {plan !== 'free' ? (
            <a className="btn-secondary" href={localScanHistoryUrl()}>
              History
            </a>
          ) : null}
          {session.context.mapsUrl ? (
            <a
              className="btn-secondary"
              href={session.context.mapsUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open Maps search
            </a>
          ) : null}
        </div>      </header>

      <div className="local-scan-tabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`local-scan-tab${tab === item.id ? ' is-active' : ''}${
              item.deep && session.mode !== 'deep' ? ' is-muted' : ''
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="local-scan-panel">
        {tab === 'overview' ? <OverviewTab businesses={session.businesses} /> : null}
        {tab === 'categories' ? <CategoriesTab businesses={session.businesses} /> : null}
        {tab === 'reviews' ? <ReviewsTab businesses={session.businesses} /> : null}
        {tab === 'location' ? (
          <LocationTab
            businesses={session.businesses}
            centerLat={session.context.searchCenterLat}
            centerLng={session.context.searchCenterLng}
          />
        ) : null}
        {tab === 'services' ? (
          <ServicesTab businesses={session.businesses} mode={session.mode} />
        ) : null}
        {tab === 'hours' ? <HoursTab businesses={session.businesses} mode={session.mode} /> : null}
        {tab === 'attributes' ? (
          <AttributesTab businesses={session.businesses} mode={session.mode} />
        ) : null}
        {tab === 'misc' ? <MiscTab businesses={session.businesses} mode={session.mode} /> : null}
        {tab === 'compare' ? (
          <CompareTab session={session} allSessions={allSessions} />
        ) : null}
        {tab === 'search3pack' ? (
          <Search3PackTab session={session} onRefresh={refresh3Pack} loading={fetching3Pack} />
        ) : null}
      </section>    </div>
  );
}
