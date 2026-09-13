import { useCallback, useEffect, useMemo, useState } from 'react';
import { snapshotToRows } from '../audit/links';
import type { AuditFinding, GbpAudit } from '../audit/types';
import { AuditWhiteLabelBranding } from '../components/AuditWhiteLabelBranding';
import AuditExportMenu from '../components/AuditExportMenu';
import { useGbpAuditStore } from '../hooks/useGbpAuditStore';
import { useScanState } from '../hooks/useScanState';
import { useWhiteLabelSettings } from '../hooks/useWhiteLabelSettings';
import { formatMapsRank, normalizeBusinessLead, type BusinessLead } from '../types';
import { formatEmailConfidence } from '../enrichment/email-validation';
import { printAuditAsPdf } from '../utils/audit-export';
import { formatAuditAge, isAuditStale, STALE_AUDIT_DAYS } from '../utils/audit-freshness';

function getUrlParams(): { leadId: string; placeId: string; auditId: string; mode: string; print: boolean } {
  const params = new URLSearchParams(window.location.search);
  return {
    leadId: params.get('leadId') ?? '',
    placeId: params.get('placeId') ?? '',
    auditId: params.get('auditId') ?? '',
    mode: params.get('mode') ?? '',
    print: params.get('print') === '1',
  };
}

function historyEntryToLead(entry: import('../gbp-audit/types').GbpAuditHistoryEntry): BusinessLead {
  const snap = entry.audit.snapshot;
  return normalizeBusinessLead({
    id: entry.placeId,
    name: entry.name,
    mapsUrl: entry.mapsUrl,
    category: snap.primaryCategory ?? '',
    address: snap.address ?? '',
    phone: snap.phone ?? '',
    rating: snap.rating != null ? String(snap.rating) : '',
    reviews: snap.reviewCount != null ? String(snap.reviewCount) : '',
    mapsRank: null,
    hasWebsite: false,
    emails: entry.emails,
    facebook: entry.facebook,
    instagram: entry.instagram,
    linkedin: entry.linkedin,
    twitter: entry.twitter,
    youtube: entry.youtube,
    tiktok: entry.tiktok,
    yelp: entry.yelp,
    yellowpages: entry.yellowpages,
    bbb: entry.bbb,
    angi: entry.angi,
    thumbtack: entry.thumbtack,
    manta: entry.manta,
    foursquare: entry.foursquare,
    mapquest: entry.mapquest,
    otherSocial: entry.otherSocial,
    ownerName: entry.ownerName,
    ownerTitle: entry.ownerTitle,
    ownerLinkedIn: entry.ownerLinkedIn,
    ownerSource: entry.ownerSource,
    facebookSource: entry.facebookSource,
    instagramSource: entry.instagramSource,
    linkedinSource: entry.linkedinSource,
    twitterSource: entry.twitterSource,
    tiktokSource: entry.tiktokSource,
    yelpSource: entry.yelpSource,
    yellowpagesSource: entry.yellowpagesSource,
    bbbSource: entry.bbbSource,
    angiSource: entry.angiSource,
    thumbtackSource: entry.thumbtackSource,
    mantaSource: entry.mantaSource,
    foursquareSource: entry.foursquareSource,
    mapquestSource: entry.mapquestSource,
    emailSources: entry.emailSources,
    enrichmentStatus: entry.enrichmentStatus,
  });
}

function FindingsList({ title, items, className }: { title: string; items: AuditFinding[]; className: string }) {
  if (items.length === 0) return null;
  return (
    <div className={`findings-group ${className}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.label}:</strong> {item.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AuditReportView({
  lead,
  audit,
  standalone,
  placeId,
  autoPrint = false,
}: {
  lead: BusinessLead;
  audit: GbpAudit;
  standalone: boolean;
  placeId?: string;
  autoPrint?: boolean;
}) {
  const snapshotRows = useMemo(() => snapshotToRows(audit.snapshot, lead), [audit.snapshot, lead]);
  const { settings: whiteLabelSettings } = useWhiteLabelSettings();
  const [refreshing, setRefreshing] = useState(false);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (!autoPrint || printed || audit.status !== 'done') return;
    const timer = window.setTimeout(() => {
      printAuditAsPdf();
      setPrinted(true);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [autoPrint, printed, audit.status]);

  const ageLabel = formatAuditAge(audit.auditedAt);
  const stale = isAuditStale(audit.auditedAt);

  const handleBack = () => {
    if (standalone) {
      window.close();
      return;
    }
    const resultsUrl = chrome.runtime.getURL('src/results/index.html');
    void chrome.tabs.create({ url: resultsUrl });
  };

  const handleRefreshAudit = useCallback(async () => {
    setRefreshing(true);
    try {
      if (standalone && placeId) {
        await chrome.runtime.sendMessage({ type: 'REFRESH_STANDALONE_AUDIT', placeId });
      } else {
        await chrome.runtime.sendMessage({ type: 'AUDIT_GBP', leadId: lead.id, openWhenDone: false });
      }
    } finally {
      window.setTimeout(() => setRefreshing(false), 2000);
    }
  }, [standalone, placeId, lead.id]);

  const score = audit.score ?? 0;

  return (
    <div className="audit-page">
      <AuditWhiteLabelBranding settings={whiteLabelSettings} />

      <header className="audit-header">
        <div>
          <h1>GBP Audit</h1>
          <p className="audit-subtitle">{lead.name}</p>
          {lead.mapsRank ? <p className="audit-subtitle">{formatMapsRank(lead.mapsRank)}</p> : null}
        </div>
        <div className="audit-actions no-print">
          <button className="btn-secondary" onClick={handleBack}>
            {standalone ? 'Close' : 'Back to Results'}
          </button>
          <button
            className="btn-secondary"
            onClick={() => void handleRefreshAudit()}
            disabled={refreshing}
            title="Re-run the audit with current Google Business Profile data"
          >
            {refreshing ? 'Refreshing…' : 'Refresh audit'}
          </button>
          <AuditExportMenu lead={lead} audit={audit} standalone={standalone} />
        </div>
      </header>

      {stale ? (
        <section className="audit-stale-banner no-print">
          <strong>Data may be outdated</strong>
          <span>
            This audit is more than {STALE_AUDIT_DAYS} days old. Refresh to pull the latest profile data.
          </span>
        </section>
      ) : null}

      <section className="audit-score-card">
        <div>
          <div className="score-value">{score}/100</div>
          <div className="score-label">GBP Optimization Score</div>
        </div>
        <div>
          <div className="score-label">Audited</div>
          <div>{audit.auditedAt ? new Date(audit.auditedAt).toLocaleString() : '—'}</div>
          {ageLabel ? <div className="audit-age-subtitle">{ageLabel}</div> : null}
          {stale ? <span className="audit-stale-badge audit-stale-badge--light">May be outdated</span> : null}
        </div>
      </section>

      {!audit.snapshot.hasWebsite && (
        <section className="audit-opportunity">
          <h2>🔴 No Website Found</h2>
          <p>
            This business currently does not appear to have a website listed on Google Business Profile.
            {lead.mapsRank
              ? ` They rank ${formatMapsRank(lead.mapsRank)} but lack a conversion path beyond Google.`
              : ''}
          </p>
        </section>
      )}

      {audit.errorMessage && (
        <section className="audit-section">
          <p className="audit-subtitle">Note: {audit.errorMessage} Partial data shown below.</p>
        </section>
      )}

      <section className="audit-section">
        <h2>Profile Snapshot</h2>
        <div className="snapshot-grid">
          {snapshotRows.map((row) => (
            <div className="snapshot-item" key={row.label}>
              <span className="label">{row.label}</span>
              <span className="value">{row.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="audit-section">
        <h2>Audit Findings</h2>
        <FindingsList title="🔴 Critical Issues" items={audit.critical} className="critical" />
        <FindingsList title="🟡 Needs Improvement" items={audit.needsImprovement} className="warning" />
        <FindingsList title="🟢 Good" items={audit.good} className="good" />
      </section>

      {audit.linkGroups.map((group) => (
        <section className="audit-section" key={group.title}>
          <h2>{group.title}</h2>
          <div className="link-grid">
            {group.links.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="link-card"
              >
                <strong>{link.label}</strong>
                {link.description ? <span>{link.description}</span> : null}
              </a>
            ))}
          </div>
        </section>
      ))}

      {((lead.emails?.length ?? 0) > 0 ||
        lead.facebook ||
        lead.instagram ||
        lead.linkedin ||
        lead.ownerName ||
        lead.yelp ||
        lead.yellowpages ||
        lead.bbb ||
        lead.angi ||
        lead.thumbtack ||
        lead.manta ||
        lead.foursquare ||
        lead.mapquest) ? (
        <section className="audit-section">
          <h2>Enrichment Data</h2>
          <div className="snapshot-grid">
            {(lead.emails ?? []).length > 0 && (
              <div className="snapshot-item">
                <span className="label">Emails</span>
                <span className="value">
                  {(lead.emails ?? [])
                    .map((entry) => `${entry.address} (${formatEmailConfidence(entry.confidence)})`)
                    .join(', ')}
                </span>
              </div>
            )}
            {lead.ownerName && (
              <div className="snapshot-item">
                <span className="label">Owner / Decision Maker</span>
                <span className="value">
                  {lead.ownerName}
                  {lead.ownerTitle ? ` (${lead.ownerTitle})` : ''}
                </span>
              </div>
            )}
            {lead.facebook && (
              <div className="snapshot-item">
                <span className="label">Facebook</span>
                <span className="value">
                  <a href={lead.facebook} target="_blank" rel="noopener noreferrer">
                    View profile
                  </a>
                </span>
              </div>
            )}
            {lead.instagram && (
              <div className="snapshot-item">
                <span className="label">Instagram</span>
                <span className="value">
                  <a href={lead.instagram} target="_blank" rel="noopener noreferrer">
                    View profile
                  </a>
                </span>
              </div>
            )}
            {lead.yelp && (
              <div className="snapshot-item">
                <span className="label">Yelp</span>
                <span className="value">
                  <a href={lead.yelp} target="_blank" rel="noopener noreferrer">
                    View listing
                  </a>
                </span>
              </div>
            )}
            {lead.yellowpages && (
              <div className="snapshot-item">
                <span className="label">Yellow Pages</span>
                <span className="value">
                  <a href={lead.yellowpages} target="_blank" rel="noopener noreferrer">
                    View listing
                  </a>
                </span>
              </div>
            )}
            {lead.bbb && (
              <div className="snapshot-item">
                <span className="label">BBB</span>
                <span className="value">
                  <a href={lead.bbb} target="_blank" rel="noopener noreferrer">
                    View listing
                  </a>
                </span>
              </div>
            )}
            {lead.angi && (
              <div className="snapshot-item">
                <span className="label">Angi</span>
                <span className="value">
                  <a href={lead.angi} target="_blank" rel="noopener noreferrer">
                    View listing
                  </a>
                </span>
              </div>
            )}
            {lead.thumbtack && (
              <div className="snapshot-item">
                <span className="label">Thumbtack</span>
                <span className="value">
                  <a href={lead.thumbtack} target="_blank" rel="noopener noreferrer">
                    View listing
                  </a>
                </span>
              </div>
            )}
            {lead.manta && (
              <div className="snapshot-item">
                <span className="label">Manta</span>
                <span className="value">
                  <a href={lead.manta} target="_blank" rel="noopener noreferrer">
                    View listing
                  </a>
                </span>
              </div>
            )}
            {lead.foursquare && (
              <div className="snapshot-item">
                <span className="label">Foursquare</span>
                <span className="value">
                  <a href={lead.foursquare} target="_blank" rel="noopener noreferrer">
                    View listing
                  </a>
                </span>
              </div>
            )}
            {lead.mapquest && (
              <div className="snapshot-item">
                <span className="label">MapQuest</span>
                <span className="value">
                  <a href={lead.mapquest} target="_blank" rel="noopener noreferrer">
                    View listing
                  </a>
                </span>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ScanLeadAuditApp({ leadId, autoPrint }: { leadId: string; autoPrint: boolean }) {
  const { state, refreshState } = useScanState();
  const lead = state.results.find((item) => item.id === leadId) ?? null;
  const audit = lead?.gbpAudit;

  useEffect(() => {
    void refreshState();
    if (audit?.status === 'running' || audit?.status === 'pending') {
      const timer = window.setInterval(() => void refreshState(), 500);
      return () => window.clearInterval(timer);
    }
  }, [refreshState, leadId, audit?.status]);

  if (!lead) {
    return (
      <div className="audit-page">
        <div className="audit-loading">Loading business audit…</div>
      </div>
    );
  }

  if (!audit || audit.status === 'running' || audit.status === 'pending') {
    return (
      <div className="audit-page">
        <div className="audit-loading">
          <h1>Auditing GBP…</h1>
          <p>Analyzing {lead.name}. This may take a few seconds.</p>
        </div>
      </div>
    );
  }

  return <AuditReportView lead={lead} audit={audit} standalone={false} autoPrint={autoPrint} />;
}

function StandaloneAuditApp({ placeId, autoPrint }: { placeId: string; autoPrint: boolean }) {
  const { getEntry, refreshStore } = useGbpAuditStore();
  const entry = getEntry(placeId);

  useEffect(() => {
    void refreshStore();
    if (entry?.audit.status === 'running' || entry?.audit.status === 'pending') {
      const timer = window.setInterval(() => void refreshStore(), 500);
      return () => window.clearInterval(timer);
    }
  }, [refreshStore, placeId, entry?.audit.status]);

  const lead = useMemo((): BusinessLead | null => {
    if (!entry) return null;
    const snap = entry.audit.snapshot;
    return normalizeBusinessLead({
      id: entry.placeId,
      name: entry.name,
      mapsUrl: entry.mapsUrl,
      category: snap.primaryCategory ?? '',
      address: snap.address ?? '',
      phone: snap.phone ?? '',
      rating: snap.rating != null ? String(snap.rating) : '',
      reviews: snap.reviewCount != null ? String(snap.reviewCount) : '',
      mapsRank: null,
      hasWebsite: false,
      emails: entry.emails,
      facebook: entry.facebook,
      instagram: entry.instagram,
      linkedin: entry.linkedin,
      twitter: entry.twitter,
      youtube: entry.youtube,
      tiktok: entry.tiktok,
      yelp: entry.yelp,
      yellowpages: entry.yellowpages,
      bbb: entry.bbb,
      angi: entry.angi,
      thumbtack: entry.thumbtack,
      manta: entry.manta,
      foursquare: entry.foursquare,
      mapquest: entry.mapquest,
      otherSocial: entry.otherSocial,
      ownerName: entry.ownerName,
      ownerTitle: entry.ownerTitle,
      ownerLinkedIn: entry.ownerLinkedIn,
      ownerSource: entry.ownerSource,
      facebookSource: entry.facebookSource,
      instagramSource: entry.instagramSource,
      linkedinSource: entry.linkedinSource,
      twitterSource: entry.twitterSource,
      tiktokSource: entry.tiktokSource,
      yelpSource: entry.yelpSource,
      yellowpagesSource: entry.yellowpagesSource,
      bbbSource: entry.bbbSource,
      angiSource: entry.angiSource,
      thumbtackSource: entry.thumbtackSource,
      mantaSource: entry.mantaSource,
      foursquareSource: entry.foursquareSource,
      mapquestSource: entry.mapquestSource,
      emailSources: entry.emailSources,
      enrichmentStatus: entry.enrichmentStatus,
    });
  }, [entry]);

  if (!entry || !lead) {
    return (
      <div className="audit-page">
        <div className="audit-loading">Loading GBP audit…</div>
      </div>
    );
  }

  if (entry.audit.status === 'running' || entry.audit.status === 'pending') {
    return (
      <div className="audit-page">
        <div className="audit-loading">
          <h1>Auditing GBP…</h1>
          <p>Analyzing {entry.name}. This may take a few seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <AuditReportView
      lead={lead}
      audit={entry.audit}
      standalone={true}
      placeId={placeId}
      autoPrint={autoPrint}
    />
  );
}

function HistoryAuditApp({ auditId, autoPrint }: { auditId: string; autoPrint: boolean }) {
  const [entry, setEntry] = useState<import('../gbp-audit/types').GbpAuditHistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = (await chrome.runtime.sendMessage({
          type: 'GET_GBP_AUDIT_HISTORY',
          auditId,
        })) as { entry?: import('../gbp-audit/types').GbpAuditHistoryEntry | null };
        if (!cancelled) {
          setEntry(res?.entry ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auditId]);

  const lead = useMemo(() => (entry ? historyEntryToLead(entry) : null), [entry]);

  if (loading) {
    return (
      <div className="audit-page">
        <div className="audit-loading">Loading saved GBP audit…</div>
      </div>
    );
  }

  if (!entry || !lead) {
    return (
      <div className="audit-page">
        <div className="audit-error">Saved audit not found. It may have been deleted from history.</div>
      </div>
    );
  }

  return (
    <AuditReportView
      lead={lead}
      audit={entry.audit}
      standalone={true}
      placeId={entry.placeId}
      autoPrint={autoPrint}
    />
  );
}

export default function App() {
  const { leadId, placeId, auditId, mode, print } = useMemo(() => getUrlParams(), []);

  if (mode === 'history' && auditId) {
    return <HistoryAuditApp auditId={auditId} autoPrint={print} />;
  }

  if (mode === 'standalone' && placeId) {
    return <StandaloneAuditApp placeId={placeId} autoPrint={print} />;
  }

  if (leadId) {
    return <ScanLeadAuditApp leadId={leadId} autoPrint={print} />;
  }

  return (
    <div className="audit-page">
      <div className="audit-error">
        No business selected. Use the GMB Audit button on a Google Maps listing, or open an audit from
        the results table.
      </div>
    </div>
  );
}
