import type { BusinessLead } from '../types';
import { consumeCsvExportQuota, getCachedUserState } from '../supabase/auth';
import { capabilitiesFromUsage, upgradeMessage } from '../supabase/plan-capabilities';
import { formatMapsRank } from '../types';
import {
  formatEmailConfidence,
  bestEmailConfidence,
  getEmailAddresses,
} from '../enrichment/email-validation';
import { computeOpportunityScore, formatOpportunityTier } from './opportunity-score';

function escapeCsvField(value: string): string {
  const normalized = value.replace(/"/g, '""');
  return `"${normalized}"`;
}

export function exportLeadsToCsv(leads: BusinessLead[]): string {
  const headers = [
    'Business Name',
    'Category',
    'Address',
    'Scan City',
    'Phone',
    'Rating',
    'Reviews',
    'Google Maps URL',
    'Google Maps Rank',
    'Opportunity Score',
    'Opportunity Tier',
    'Emails',
    'Best Email Confidence',
    'Email Details',
    'Email Source',
    'Facebook',
    'Facebook Source',
    'Instagram',
    'Instagram Source',
    'LinkedIn',
    'LinkedIn Source',
    'Twitter',
    'Twitter Source',
    'TikTok',
    'TikTok Source',
    'Yelp',
    'Yelp Source',
    'Yellow Pages',
    'Yellow Pages Source',
    'BBB',
    'BBB Source',
    'Angi',
    'Angi Source',
    'Thumbtack',
    'Thumbtack Source',
    'Manta',
    'Manta Source',
    'Foursquare',
    'Foursquare Source',
    'MapQuest',
    'MapQuest Source',
    'Owner Name',
    'Owner Title',
    'Owner LinkedIn',
    'Owner Source',
    'Enrichment Status',
    'GBP Score',
    'GBP Audit Date',
    'GBP Critical Issues',
    'GBP Needs Improvement',
    'GBP Good',
    'Website Opportunity',
  ];

  const rows = leads.map((lead) => {
    const opportunity = computeOpportunityScore(lead);
    return [
      lead.name,
      lead.category,
      lead.address,
      lead.scanCity ?? '',
      lead.phone,
      lead.rating,
      lead.reviews,
      lead.mapsUrl,
      formatMapsRank(lead.mapsRank),
      String(opportunity.total),
      formatOpportunityTier(opportunity.tier),
      getEmailAddresses(lead.emails).join('; '),
      bestEmailConfidence(lead.emails)
        ? formatEmailConfidence(bestEmailConfidence(lead.emails)!)
        : '',
      (lead.emails ?? [])
        .map((entry) => `${entry.address} (${formatEmailConfidence(entry.confidence)})`)
        .join('; '),
      lead.emailSources,
      lead.facebook,
      lead.facebookSource,
      lead.instagram,
      lead.instagramSource,
      lead.linkedin,
      lead.linkedinSource,
      lead.twitter,
      lead.twitterSource,
      lead.tiktok,
      lead.tiktokSource,
      lead.yelp,
      lead.yelpSource,
      lead.yellowpages,
      lead.yellowpagesSource,
      lead.bbb,
      lead.bbbSource,
      lead.angi,
      lead.angiSource,
      lead.thumbtack,
      lead.thumbtackSource,
      lead.manta,
      lead.mantaSource,
      lead.foursquare,
      lead.foursquareSource,
      lead.mapquest,
      lead.mapquestSource,
      lead.ownerName,
      lead.ownerTitle,
      lead.ownerLinkedIn,
      lead.ownerSource,
      lead.enrichmentStatus,
      lead.gbpAudit?.score != null ? String(lead.gbpAudit.score) : '',
      lead.gbpAudit?.auditedAt ?? '',
      (lead.gbpAudit?.critical ?? []).map((f) => f.message).join('; '),
      (lead.gbpAudit?.needsImprovement ?? []).map((f) => f.message).join('; '),
      (lead.gbpAudit?.good ?? []).map((f) => f.message).join('; '),
      lead.gbpAudit?.snapshot?.hasWebsite === false ? 'Yes — No website on GBP' : '',
    ]
      .map(escapeCsvField)
      .join(',');
  });

  return [headers.map(escapeCsvField).join(','), ...rows].join('\n');
}

export async function downloadCsv(
  leads: BusinessLead[],
  filename = 'no-website-leads.csv'
): Promise<{ ok: boolean; error?: string }> {
  if (leads.length === 0) return { ok: false, error: 'No leads to export.' };

  const cached = await getCachedUserState();
  const plan = cached.profile?.plan ?? 'free';
  const caps = capabilitiesFromUsage(cached.usage as Record<string, unknown> | null, plan);

  if (!caps.csvExportEnabled) {
    return { ok: false, error: upgradeMessage('CSV export') };
  }

  const quota = await consumeCsvExportQuota();
  if (!quota.allowed) {
    return { ok: false, error: quota.message };
  }

  let exportLeads = leads;
  if (caps.csvExportMaxRows > 0 && leads.length > caps.csvExportMaxRows) {
    exportLeads = leads.slice(0, caps.csvExportMaxRows);
  }

  const csv = '\uFEFF' + exportLeadsToCsv(exportLeads);
  const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;

  try {
    await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: true,
    });
    return { ok: true };
  } catch {
    // Fall through to an anchor download
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { ok: true };
}
