import { snapshotToRows } from '../audit/links';
import type { AuditFinding, GbpAudit } from '../audit/types';
import type { BusinessLead } from '../types';
import { formatMapsRank } from '../types';
import {
  formatEmailConfidence,
  getEmailAddresses,
  type ValidatedEmail,
} from '../enrichment/email-validation';
import {
  formatWhiteLabelContact,
  isWhiteLabelActive,
  type WhiteLabelSettings,
} from '../settings/white-label-settings';
import { generateAuditPdfBlob } from './audit-pdf-export';

export type AuditExportFormat = 'pdf' | 'pdf-print' | 'csv' | 'json';

function escapeCsvField(value: string): string {
  const normalized = value.replace(/"/g, '""');
  return `"${normalized}"`;
}

function sanitizeFilename(name: string): string {
  const slug = name
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return slug || 'gbp-audit';
}

function formatFindingsForCsv(findings: AuditFinding[]): string {
  if (findings.length === 0) return '';
  return findings.map((f) => `${f.label}: ${f.message}`).join('; ');
}

export interface AuditExportPayload {
  exportedAt: string;
  businessName: string;
  mapsRank: string;
  score: number | null;
  auditedAt: string;
  noWebsiteOpportunity: boolean;
  errorMessage?: string;
  snapshotRows: { label: string; value: string }[];
  critical: AuditFinding[];
  needsImprovement: AuditFinding[];
  good: AuditFinding[];
  linkGroups: GbpAudit['linkGroups'];
  enrichment?: {
    emails?: ValidatedEmail[];
    ownerName?: string;
    ownerTitle?: string;
    facebook?: string;
    instagram?: string;
  };
  whiteLabel?: WhiteLabelSettings;
  audit: GbpAudit;
}

export function buildAuditExportPayload(
  lead: BusinessLead,
  audit: GbpAudit,
  whiteLabel?: WhiteLabelSettings
): AuditExportPayload {
  const enrichment =
    (lead.emails?.length ?? 0) > 0 || lead.facebook || lead.ownerName || lead.instagram
      ? {
          emails: lead.emails,
          ownerName: lead.ownerName,
          ownerTitle: lead.ownerTitle,
          facebook: lead.facebook,
          instagram: lead.instagram,
        }
      : undefined;

  return {
    exportedAt: new Date().toISOString(),
    businessName: lead.name,
    mapsRank: formatMapsRank(lead.mapsRank),
    score: audit.score,
    auditedAt: audit.auditedAt,
    noWebsiteOpportunity: !audit.snapshot.hasWebsite,
    errorMessage: audit.errorMessage,
    snapshotRows: snapshotToRows(audit.snapshot, lead),
    critical: audit.critical,
    needsImprovement: audit.needsImprovement,
    good: audit.good,
    linkGroups: audit.linkGroups,
    enrichment,
    whiteLabel: whiteLabel && isWhiteLabelActive(whiteLabel) ? whiteLabel : undefined,
    audit,
  };
}

export function exportAuditToCsv(payload: AuditExportPayload): string {
  const lines: string[] = [];

  const addSection = (title: string, rows: [string, string][]) => {
    lines.push('');
    lines.push(escapeCsvField(title));
    lines.push('Field,Value');
    for (const [label, value] of rows) {
      lines.push([escapeCsvField(label), escapeCsvField(value)].join(','));
    }
  };

  addSection('GBP Audit Summary', [
    ['Business Name', payload.businessName],
    ['Google Maps Rank', payload.mapsRank || 'N/A'],
    ['GBP Optimization Score', payload.score != null ? `${payload.score}/100` : 'N/A'],
    ['Audited At', payload.auditedAt ? new Date(payload.auditedAt).toLocaleString() : 'N/A'],
    ['Exported At', new Date(payload.exportedAt).toLocaleString()],
    ['No Website on GBP', payload.noWebsiteOpportunity ? 'Yes' : 'No'],
    ...(payload.errorMessage ? [['Note', payload.errorMessage] as [string, string]] : []),
  ]);

  if (payload.whiteLabel) {
    addSection('Prepared By', [
      ['Agency', payload.whiteLabel.agencyName || 'N/A'],
      ['Tagline', payload.whiteLabel.tagline || 'N/A'],
      ['Email', payload.whiteLabel.contactEmail || 'N/A'],
      ['Phone', payload.whiteLabel.contactPhone || 'N/A'],
      ['Website', payload.whiteLabel.website || 'N/A'],
      ['Contact', formatWhiteLabelContact(payload.whiteLabel) || 'N/A'],
    ]);
  }

  addSection(
    'Profile Snapshot',
    payload.snapshotRows.map((row) => [row.label, row.value])
  );

  addSection('Audit Findings', [
    ['Critical Issues', formatFindingsForCsv(payload.critical) || 'None'],
    ['Needs Improvement', formatFindingsForCsv(payload.needsImprovement) || 'None'],
    ['Good', formatFindingsForCsv(payload.good) || 'None'],
  ]);

  if (payload.enrichment) {
    addSection('Enrichment Data', [
      ['Emails', getEmailAddresses(payload.enrichment.emails).join('; ') || 'N/A'],
      [
        'Email Confidence',
        (payload.enrichment.emails ?? [])
          .map((entry) => `${entry.address} (${formatEmailConfidence(entry.confidence)})`)
          .join('; ') || 'N/A',
      ],
      [
        'Owner / Decision Maker',
        payload.enrichment.ownerName
          ? `${payload.enrichment.ownerName}${payload.enrichment.ownerTitle ? ` (${payload.enrichment.ownerTitle})` : ''}`
          : 'N/A',
      ],
      ['Facebook', payload.enrichment.facebook ?? 'N/A'],
      ['Instagram', payload.enrichment.instagram ?? 'N/A'],
    ]);
  }

  const linkRows: [string, string][] = [];
  for (const group of payload.linkGroups) {
    for (const link of group.links) {
      linkRows.push([`${group.title} — ${link.label}`, link.url]);
    }
  }
  if (linkRows.length > 0) {
    addSection('Reference Links', linkRows);
  }

  return '\uFEFF' + lines.join('\n').trimStart();
}

export function exportAuditToJson(payload: AuditExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

async function downloadBinaryFile(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs: true,
    });
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  } catch {
    // Fall through to anchor download
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string
): Promise<void> {
  const dataUrl = `data:${mimeType},${encodeURIComponent(content)}`;

  try {
    await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: true,
    });
    return;
  } catch {
    // Fall through to anchor download
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadAuditExport(
  lead: BusinessLead,
  audit: GbpAudit,
  format: AuditExportFormat,
  whiteLabel?: WhiteLabelSettings
): Promise<void> {
  const payload = buildAuditExportPayload(lead, audit, whiteLabel);
  const baseName = sanitizeFilename(payload.businessName);

  if (format === 'pdf') {
    await downloadBinaryFile(generateAuditPdfBlob(payload), `${baseName}-gbp-audit.pdf`);
    return;
  }

  if (format === 'pdf-print') {
    printAuditAsPdf();
    return;
  }

  if (format === 'csv') {
    await downloadTextFile(
      exportAuditToCsv(payload),
      `${baseName}-gbp-audit.csv`,
      'text/csv;charset=utf-8'
    );
    return;
  }

  await downloadTextFile(
    exportAuditToJson(payload),
    `${baseName}-gbp-audit.json`,
    'application/json;charset=utf-8'
  );
}

export function printAuditAsPdf(): void {
  document.body.classList.add('audit-print-mode');
  window.print();
  window.addEventListener(
    'afterprint',
    () => {
      document.body.classList.remove('audit-print-mode');
    },
    { once: true }
  );
}
