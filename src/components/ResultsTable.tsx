import AuditExportMenu from './AuditExportMenu';
import type { BusinessLead } from '../types';
import { formatMapsRank } from '../types';
import {
  formatEmailConfidence,
  type ValidatedEmail,
} from '../enrichment/email-validation';
import {
  computeOpportunityScore,
  formatOpportunityTier,
} from '../utils/opportunity-score';
import { formatAuditAge, isAuditStale } from '../utils/audit-freshness';
import type { Plan } from '../supabase/types';

interface ResultsTableProps {
  leads: BusinessLead[];
  auditingId?: string | null;
  auditError?: string | null;
  plan?: Plan;
  onAuditGbp?: (leadId: string, openWhenDone?: boolean) => void;
  onRefreshAudit?: (leadId: string) => void;
  onViewAudit?: (leadId: string) => void;
}

function LinkCell({ url, label }: { url: string; label?: string }) {
  if (!url) return <>—</>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="link-cell">
      {label ?? 'View'}
    </a>
  );
}

function UpgradableCell({ url, plan, blocked }: { url: string; plan?: Plan; blocked: boolean }) {
  if (!url) {
    if (plan === 'free' && blocked) {
      return (
        <span
          className="upgrade-hint"
          title="Upgrade to Lifetime to unlock all enrichment sources"
          style={{ color: '#666', fontSize: '0.85em', cursor: 'help' }}
        >
          🔒 Upgrade
        </span>
      );
    }
    return <>—</>;
  }
  return <LinkCell url={url} />;
}

function EnrichmentBadge({ status }: { status: BusinessLead['enrichmentStatus'] }) {
  if (status === 'done') return <span className="badge badge-done">Enriched</span>;
  if (status === 'partial') return <span className="badge badge-partial">Partial</span>;
  if (status === 'pending') return <span className="badge badge-pending">Pending</span>;
  return null;
}

function AuditCell({
  lead,
  auditing,
  error,
  onAudit,
  onRefresh,
  onView,
}: {
  lead: BusinessLead;
  auditing: boolean;
  error?: string | null;
  onAudit?: (id: string, openWhenDone?: boolean) => void;
  onRefresh?: (id: string) => void;
  onView?: (id: string) => void;
}) {
  const audit = lead.gbpAudit;
  
  // Show error message if quota exceeded or other error
  if (error && auditing) {
    return <span className="audit-status audit-error">{error}</span>;
  }
  
  if (auditing || audit?.status === 'running') {
    return <span className="audit-status">Auditing…</span>;
  }
  if (audit?.status === 'done' && audit.score !== null) {
    const ageLabel = formatAuditAge(audit.auditedAt);
    const stale = isAuditStale(audit.auditedAt);
    return (
      <div className="audit-actions-cell">
        <button type="button" className="btn-audit btn-audit-done" onClick={() => onView?.(lead.id)}>
          Score: {audit.score}
        </button>
        {ageLabel ? <span className="audit-age-label">{ageLabel}</span> : null}
        {stale ? <span className="audit-stale-badge">Data may be outdated</span> : null}
        <button type="button" className="btn-audit-link" onClick={() => onView?.(lead.id)}>
          View Full Audit
        </button>
        <button
          type="button"
          className="btn-audit-link"
          onClick={() => onRefresh?.(lead.id)}
          title="Re-run the GBP audit with current profile data"
        >
          Refresh audit
        </button>
        {audit ? <AuditExportMenu lead={lead} audit={audit} compact /> : null}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="btn-audit"
      onClick={(e) => onAudit?.(lead.id, e.shiftKey)}
      title="Shift+click to open the report when the audit finishes"
    >
      Audit GBP
    </button>
  );
}

function EmailCell({ emails, source, plan }: { emails: ValidatedEmail[]; source: string; plan?: Plan }) {
  if (emails.length === 0) {
    if (plan === 'free') {
      return (
        <span
          className="upgrade-hint"
          title="Upgrade to Lifetime to unlock email enrichment"
          style={{ color: '#666', fontSize: '0.85em', cursor: 'help' }}
        >
          🔒 Upgrade
        </span>
      );
    }
    return <>—</>;
  }
  return (
    <div className="email-cell">
      {emails.map((entry) => (
        <div className="email-row" key={entry.address} title={source}>
          <span className="email-address">{entry.address}</span>
          <span className={`email-confidence confidence-${entry.confidence}`}>
            {formatEmailConfidence(entry.confidence)}
          </span>
        </div>
      ))}
    </div>
  );
}

function OpportunityCell({ lead }: { lead: BusinessLead }) {
  const { total, tier, summary } = computeOpportunityScore(lead);
  return (
    <div className="opportunity-cell" title={summary}>
      <span className={`opportunity-score opportunity-${tier}`}>{total}</span>
      <span className={`opportunity-tier tier-${tier}`}>{formatOpportunityTier(tier)}</span>
    </div>
  );
}

export default function ResultsTable({ leads, auditingId, auditError, plan, onAuditGbp, onRefreshAudit, onViewAudit }: ResultsTableProps) {
  const safeLeads = Array.isArray(leads) ? leads : [];
  const showScanCity = safeLeads.some((lead) => Boolean(lead.scanCity));

  if (safeLeads.length === 0) {
    return (
      <div className="empty-results">
        No businesses without websites yet. Start a scan to fill this list.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="results-table">
        <thead>
          <tr>
            <th>Opportunity</th>
            <th>Rank</th>
            <th>Business</th>
            <th>Category</th>
            <th>Location</th>
            {showScanCity ? <th>Scan city</th> : null}
            <th>Phone</th>
            <th>Rating</th>
            <th>Reviews</th>
            <th>Email</th>
            <th>Facebook</th>
            <th>Instagram</th>
            <th>LinkedIn</th>
            <th>Twitter</th>
            <th>TikTok</th>
            <th>Yelp</th>
            <th>Yellow Pages</th>
            <th>BBB</th>
            <th>Angi</th>
            <th>Thumbtack</th>
            <th>Manta</th>
            <th>Foursquare</th>
            <th>MapQuest</th>
            <th>Owner</th>
            <th>Enrichment</th>
            <th>GBP Audit</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {safeLeads.map((lead) => {
            return (
              <tr key={lead.id}>
                <td className="opportunity-col">
                  <OpportunityCell lead={lead} />
                </td>
                <td className="rank">
                  <span className="maps-rank">{formatMapsRank(lead.mapsRank)}</span>
                </td>
                <td className="name">
                  <span>{lead.name}</span>
                </td>
                <td>{lead.category || '—'}</td>
                <td className="location">{lead.address || '—'}</td>
                {showScanCity ? <td className="scan-city">{lead.scanCity || '—'}</td> : null}
                <td>{lead.phone || '—'}</td>
                <td className="num">{lead.rating || '—'}</td>
                <td className="num">{lead.reviews || '—'}</td>
                <td className="contact">
                  <EmailCell emails={lead.emails ?? []} source={lead.emailSources} plan={plan} />
                </td>
                <td><UpgradableCell url={lead.facebook} plan={plan} blocked={false} /></td>
                <td><UpgradableCell url={lead.instagram} plan={plan} blocked={false} /></td>
                <td><UpgradableCell url={lead.linkedin} plan={plan} blocked={false} /></td>
                <td><UpgradableCell url={lead.twitter} plan={plan} blocked={true} /></td>
                <td><UpgradableCell url={lead.tiktok} plan={plan} blocked={true} /></td>
                <td><UpgradableCell url={lead.yelp} plan={plan} blocked={true} /></td>
                <td><UpgradableCell url={lead.yellowpages} plan={plan} blocked={true} /></td>
                <td><UpgradableCell url={lead.bbb} plan={plan} blocked={true} /></td>
                <td><UpgradableCell url={lead.angi} plan={plan} blocked={true} /></td>
                <td><UpgradableCell url={lead.thumbtack} plan={plan} blocked={true} /></td>
                <td><UpgradableCell url={lead.manta} plan={plan} blocked={true} /></td>
                <td><UpgradableCell url={lead.foursquare} plan={plan} blocked={true} /></td>
                <td><UpgradableCell url={lead.mapquest} plan={plan} blocked={true} /></td>
                <td className="owner">
                  {lead.ownerName ? (
                    <>
                      <strong>{lead.ownerName}</strong>
                      {lead.ownerTitle ? ` (${lead.ownerTitle})` : ''}
                      {lead.ownerLinkedIn ? (
                        <>
                          {' '}
                          <LinkCell url={lead.ownerLinkedIn} label="LinkedIn" />
                        </>
                      ) : null}
                    </>
                  ) : plan === 'free' ? (
                    <span
                      className="upgrade-hint"
                      title="Upgrade to Lifetime to unlock owner enrichment"
                      style={{ color: '#666', fontSize: '0.85em', cursor: 'help' }}
                    >
                      🔒 Upgrade
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <EnrichmentBadge status={lead.enrichmentStatus} />
                </td>
                <td className="audit-col">
                  <AuditCell
                    lead={lead}
                    auditing={auditingId === lead.id}
                    error={auditError}
                    onAudit={onAuditGbp}
                    onRefresh={onRefreshAudit}
                    onView={onViewAudit}
                  />
                </td>
                <td>
                  {lead.mapsUrl ? (
                    <a
                      href={lead.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="maps-link"
                    >
                      Maps
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
