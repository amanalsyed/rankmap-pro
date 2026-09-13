import { jsPDF } from 'jspdf';
import type { AuditFinding } from '../audit/types';
import { formatWhiteLabelContact } from '../settings/white-label-settings';
import {
  formatEmailConfidence,
} from '../enrichment/email-validation';
import type { AuditExportPayload } from './audit-export';

const MARGIN = 52;
const FOOTER_H = 36;
const BRAND = { r: 79, g: 70, b: 229 };
const MUTED = { r: 107, g: 114, b: 128 };
const DANGER = { r: 220, g: 38, b: 38 };
const WARNING = { r: 217, g: 119, b: 6 };
const SUCCESS = { r: 5, g: 150, b: 105 };
const ROW_ALT = { r: 248, g: 250, b: 252 };

type PdfCursor = {
  doc: jsPDF;
  y: number;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
};

function createCursor(doc: jsPDF): PdfCursor {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  return {
    doc,
    y: MARGIN,
    pageWidth,
    pageHeight,
    contentWidth: pageWidth - MARGIN * 2,
  };
}

function bottomLimit(cursor: PdfCursor): number {
  return cursor.pageHeight - MARGIN - FOOTER_H;
}

function ensureSpace(cursor: PdfCursor, height: number): void {
  if (cursor.y + height <= bottomLimit(cursor)) return;
  cursor.doc.addPage();
  cursor.y = MARGIN;
}

function advance(cursor: PdfCursor, amount: number): void {
  cursor.y += amount;
}

function sanitizePdfText(text: string): string {
  return text
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/(\d)\s*&\s*\./g, '$1')
    .trim();
}

function formatHoursForPdf(hours: string): string {
  if (!hours || hours === 'N/A') return hours;
  return hours
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n');
}

function setMuted(cursor: PdfCursor, size = 9): void {
  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(size);
  cursor.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
}

function setBody(cursor: PdfCursor, size = 10): void {
  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(size);
  cursor.doc.setTextColor(17, 24, 39);
}

function setBold(cursor: PdfCursor, size = 11): void {
  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(size);
  cursor.doc.setTextColor(17, 24, 39);
}

function drawWrapped(
  cursor: PdfCursor,
  text: string,
  x: number,
  width: number,
  lineHeight: number
): void {
  const safe = sanitizePdfText(text);
  const lines = cursor.doc.splitTextToSize(safe, width) as string[];
  for (const line of lines) {
    ensureSpace(cursor, lineHeight);
    cursor.doc.text(line, x, cursor.y);
    advance(cursor, lineHeight);
  }
}

function logoFormat(dataUrl: string): 'PNG' | 'JPEG' | null {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  return null;
}

function drawWhiteLabelHeader(cursor: PdfCursor, payload: AuditExportPayload): void {
  const branding = payload.whiteLabel;
  if (!branding) return;

  const boxTop = cursor.y;
  const boxPad = 14;
  let textX = MARGIN + boxPad;
  const textWidth = cursor.contentWidth - boxPad * 2;
  let innerY = boxTop + boxPad + 12;

  cursor.doc.setFillColor(248, 250, 252);
  cursor.doc.setDrawColor(226, 232, 240);
  cursor.doc.roundedRect(MARGIN, boxTop, cursor.contentWidth, 88, 8, 8, 'FD');

  if (branding.logoDataUrl) {
    const format = logoFormat(branding.logoDataUrl);
    if (format) {
      try {
        cursor.doc.addImage(branding.logoDataUrl, format, MARGIN + boxPad, boxTop + boxPad, 44, 44);
        textX = MARGIN + boxPad + 54;
      } catch {
        // Skip invalid logo
      }
    }
  }

  if (branding.agencyName) {
    setBold(cursor, 16);
    cursor.doc.text(branding.agencyName, textX, innerY);
    innerY += 18;
  }

  if (branding.tagline) {
    setMuted(cursor, 9);
    cursor.doc.text(branding.tagline, textX, innerY);
    innerY += 13;
  }

  const contact = formatWhiteLabelContact(branding);
  if (contact) {
    setBody(cursor, 8);
    const contactLines = cursor.doc.splitTextToSize(sanitizePdfText(contact), textWidth - (textX - MARGIN - boxPad)) as string[];
    for (const line of contactLines.slice(0, 2)) {
      cursor.doc.text(line, textX, innerY);
      innerY += 11;
    }
  }

  cursor.y = boxTop + 96;
  setMuted(cursor, 7);
  cursor.doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  cursor.doc.text('GOOGLE BUSINESS PROFILE AUDIT', MARGIN, cursor.y);
  advance(cursor, 20);
}

function drawReportTitle(cursor: PdfCursor, payload: AuditExportPayload): void {
  setBold(cursor, 22);
  cursor.doc.text(sanitizePdfText(payload.businessName), MARGIN, cursor.y);
  advance(cursor, 18);

  const meta: string[] = [];
  if (payload.mapsRank) meta.push(payload.mapsRank);
  const category = payload.snapshotRows.find((row) => row.label === 'Primary Category')?.value;
  if (category && category !== 'N/A') meta.push(category);
  const address = payload.snapshotRows.find((row) => row.label === 'Address')?.value;
  if (address && address !== 'N/A') meta.push(address);

  if (meta.length > 0) {
    setMuted(cursor, 10);
    drawWrapped(cursor, meta.join('  ·  '), MARGIN, cursor.contentWidth, 13);
    advance(cursor, 4);
  }
}

function drawScoreSummary(cursor: PdfCursor, payload: AuditExportPayload): void {
  const cardH = 68;
  ensureSpace(cursor, cardH + 12);
  const cardTop = cursor.y;

  cursor.doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  cursor.doc.roundedRect(MARGIN, cardTop, cursor.contentWidth, cardH, 10, 10, 'F');

  cursor.doc.setTextColor(255, 255, 255);
  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(34);
  cursor.doc.text(`${payload.score ?? '—'}`, MARGIN + 18, cardTop + 38);
  cursor.doc.setFontSize(16);
  cursor.doc.text('/100', MARGIN + 18 + cursor.doc.getTextWidth(`${payload.score ?? '—'}`) + 4, cardTop + 38);

  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(11);
  cursor.doc.text('GBP Optimization Score', MARGIN + 18, cardTop + 54);

  const auditedLabel = payload.auditedAt
    ? new Date(payload.auditedAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';
  cursor.doc.setFontSize(10);
  cursor.doc.text('Audited', cursor.pageWidth - MARGIN - 18, cardTop + 28, { align: 'right' });
  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.text(auditedLabel, cursor.pageWidth - MARGIN - 18, cardTop + 42, { align: 'right' });

  cursor.y = cardTop + cardH + 14;
}

function drawHighlightBox(
  cursor: PdfCursor,
  title: string,
  body: string,
  accent: { r: number; g: number; b: number },
  fill: { r: number; g: number; b: number }
): void {
  const bodyLines = cursor.doc.splitTextToSize(sanitizePdfText(body), cursor.contentWidth - 28) as string[];
  const boxH = 28 + bodyLines.length * 12;
  ensureSpace(cursor, boxH + 8);

  const top = cursor.y;
  cursor.doc.setFillColor(fill.r, fill.g, fill.b);
  cursor.doc.setDrawColor(accent.r, accent.g, accent.b);
  cursor.doc.setLineWidth(1);
  cursor.doc.roundedRect(MARGIN, top, cursor.contentWidth, boxH, 6, 6, 'FD');
  cursor.doc.setFillColor(accent.r, accent.g, accent.b);
  cursor.doc.rect(MARGIN, top, 4, boxH, 'F');

  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(11);
  cursor.doc.setTextColor(accent.r, accent.g, accent.b);
  cursor.doc.text(title, MARGIN + 14, top + 18);

  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(9);
  cursor.doc.setTextColor(55, 65, 81);
  let lineY = top + 32;
  for (const line of bodyLines) {
    cursor.doc.text(line, MARGIN + 14, lineY);
    lineY += 12;
  }

  cursor.y = top + boxH + 10;
}

function drawExecutiveSummary(cursor: PdfCursor, payload: AuditExportPayload): void {
  const bullets: string[] = [];

  if (payload.noWebsiteOpportunity) {
    bullets.push('No website is listed on Google Business Profile — strong opportunity for web design and SEO.');
  }
  if (payload.mapsRank) {
    bullets.push(`${payload.businessName} ranks ${payload.mapsRank} on Google Maps.`);
  }
  if (payload.critical.length > 0) {
    bullets.push(payload.critical[0].message);
  } else if (payload.needsImprovement.length > 0) {
    bullets.push(payload.needsImprovement[0].message);
  }
  if (payload.score != null) {
    const tier =
      payload.score >= 70 ? 'well optimized' : payload.score >= 45 ? 'partially optimized' : 'under-optimized';
    bullets.push(`Overall profile health: ${tier} (${payload.score}/100).`);
  }

  if (bullets.length === 0) return;

  drawSectionTitle(cursor, 'Executive Summary');
  for (const bullet of bullets.slice(0, 4)) {
    ensureSpace(cursor, 16);
    setBody(cursor, 10);
    drawWrapped(cursor, `•  ${bullet}`, MARGIN + 4, cursor.contentWidth - 8, 14);
    advance(cursor, 2);
  }
  advance(cursor, 6);
}

function drawSectionTitle(cursor: PdfCursor, title: string, subtitle?: string): void {
  ensureSpace(cursor, subtitle ? 34 : 24);
  cursor.doc.setDrawColor(226, 232, 240);
  cursor.doc.setLineWidth(0.75);
  cursor.doc.line(MARGIN, cursor.y, cursor.pageWidth - MARGIN, cursor.y);
  advance(cursor, 14);
  setBold(cursor, 14);
  cursor.doc.text(title, MARGIN, cursor.y);
  advance(cursor, subtitle ? 14 : 12);
  if (subtitle) {
    setMuted(cursor, 9);
    cursor.doc.text(subtitle, MARGIN, cursor.y);
    advance(cursor, 12);
  }
}

function prepareSnapshotRow(row: { label: string; value: string }): { label: string; value: string } {
  let value = row.value;
  if (row.label === 'Business Hours' || row.label === 'Special Hours') {
    value = formatHoursForPdf(row.value);
  }
  if (row.label === 'Services' || row.label === 'Attributes' || row.label === 'Service Areas') {
    value = value.includes(',') ? value.split(',').map((part) => part.trim()).join('\n') : value;
  }
  if (row.label === 'Secondary Categories') {
    value = value.includes(',') ? value.split(',').map((part) => part.trim()).join('\n') : value;
  }
  return { label: row.label, value: sanitizePdfText(value) };
}

function drawSnapshotTable(cursor: PdfCursor, rows: { label: string; value: string }[]): void {
  const labelColW = 148;
  const valueColW = cursor.contentWidth - labelColW;
  const padX = 10;
  const padY = 8;

  for (let i = 0; i < rows.length; i++) {
    const row = prepareSnapshotRow(rows[i]);
    const valueLines = cursor.doc.splitTextToSize(row.value || '—', valueColW - padX * 2) as string[];
    const rowH = Math.max(26, valueLines.length * 12 + padY * 2);

    ensureSpace(cursor, rowH + 2);
    const top = cursor.y;

    if (i % 2 === 0) {
      cursor.doc.setFillColor(ROW_ALT.r, ROW_ALT.g, ROW_ALT.b);
      cursor.doc.rect(MARGIN, top, cursor.contentWidth, rowH, 'F');
    }

    setMuted(cursor, 8);
    cursor.doc.text(row.label.toUpperCase(), MARGIN + padX, top + padY + 8);

    setBody(cursor, 10);
    let lineY = top + padY + 8;
    for (const line of valueLines) {
      cursor.doc.text(line, MARGIN + labelColW + padX, lineY);
      lineY += 12;
    }

    cursor.y = top + rowH;
  }

  advance(cursor, 8);
}

function drawFindingsSection(
  cursor: PdfCursor,
  title: string,
  items: AuditFinding[],
  accent: { r: number; g: number; b: number }
): void {
  if (items.length === 0) return;

  ensureSpace(cursor, 24);
  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(11);
  cursor.doc.setTextColor(accent.r, accent.g, accent.b);
  cursor.doc.text(`${title} (${items.length})`, MARGIN, cursor.y);
  advance(cursor, 12);

  for (const item of items) {
    const message = sanitizePdfText(item.message);
    const messageLines = cursor.doc.splitTextToSize(message, cursor.contentWidth - 36) as string[];
    const boxH = 22 + messageLines.length * 12;
    ensureSpace(cursor, boxH + 6);

    const top = cursor.y;
    cursor.doc.setFillColor(255, 255, 255);
    cursor.doc.setDrawColor(230, 232, 240);
    cursor.doc.roundedRect(MARGIN, top, cursor.contentWidth, boxH, 4, 4, 'FD');
    cursor.doc.setFillColor(accent.r, accent.g, accent.b);
    cursor.doc.circle(MARGIN + 12, top + 14, 3, 'F');

    setBold(cursor, 10);
    cursor.doc.text(sanitizePdfText(item.label), MARGIN + 22, top + 16);

    setBody(cursor, 9);
    let lineY = top + 28;
    for (const line of messageLines) {
      cursor.doc.text(line, MARGIN + 22, lineY);
      lineY += 12;
    }

    cursor.y = top + boxH + 6;
  }

  advance(cursor, 4);
}

function drawEnrichmentBlock(cursor: PdfCursor, payload: AuditExportPayload): void {
  const enrichment = payload.enrichment;
  if (!enrichment) return;

  drawSectionTitle(cursor, 'Enrichment Data');

  const emails =
    (enrichment.emails ?? [])
      .map((entry) => `${entry.address} (${formatEmailConfidence(entry.confidence)})`)
      .join('\n') || '—';

  drawSnapshotTable(cursor, [
    { label: 'Emails', value: emails },
    {
      label: 'Owner / Decision Maker',
      value: enrichment.ownerName
        ? `${enrichment.ownerName}${enrichment.ownerTitle ? ` (${enrichment.ownerTitle})` : ''}`
        : '—',
    },
    { label: 'Facebook', value: enrichment.facebook ?? '—' },
    { label: 'Instagram', value: enrichment.instagram ?? '—' },
  ]);
}

function drawReferenceLinks(cursor: PdfCursor, payload: AuditExportPayload): void {
  if (payload.linkGroups.length === 0) return;

  drawSectionTitle(cursor, 'Reference Links', 'All research and profile URLs from this audit');

  for (const group of payload.linkGroups) {
    ensureSpace(cursor, 20);
    setBold(cursor, 11);
    cursor.doc.text(sanitizePdfText(group.title), MARGIN, cursor.y);
    advance(cursor, 14);

    for (const link of group.links) {
      const desc = link.description ? sanitizePdfText(link.description) : '';
      const urlLines = cursor.doc.splitTextToSize(link.url, cursor.contentWidth - 16) as string[];
      const blockH = 14 + (desc ? 12 : 0) + urlLines.length * 10 + 8;
      ensureSpace(cursor, blockH);

      setBold(cursor, 9);
      cursor.doc.text(sanitizePdfText(link.label), MARGIN + 8, cursor.y);
      advance(cursor, 12);

      if (desc) {
        setMuted(cursor, 8);
        cursor.doc.text(desc, MARGIN + 8, cursor.y);
        advance(cursor, 11);
      }

      cursor.doc.setFont('helvetica', 'normal');
      cursor.doc.setFontSize(8);
      cursor.doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
      for (const line of urlLines) {
        ensureSpace(cursor, 10);
        cursor.doc.textWithLink(line, MARGIN + 8, cursor.y, { url: link.url });
        advance(cursor, 10);
      }

      setBody(cursor, 8);
      advance(cursor, 6);
    }

    advance(cursor, 4);
  }
}

function drawPageFooters(doc: jsPDF, payload: AuditExportPayload): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const branding = payload.whiteLabel;
  const footerLeft = branding?.agencyName
    ? `Prepared by ${branding.agencyName}`
    : 'GBP Audit Report';

  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN, pageHeight - FOOTER_H + 8, pageWidth - MARGIN, pageHeight - FOOTER_H + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(footerLeft, MARGIN, pageHeight - 16);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 16, { align: 'right' });
  }
}

export function generateAuditPdfBlob(payload: AuditExportPayload): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const cursor = createCursor(doc);

  drawWhiteLabelHeader(cursor, payload);
  drawReportTitle(cursor, payload);
  drawScoreSummary(cursor, payload);

  if (payload.noWebsiteOpportunity) {
    drawHighlightBox(
      cursor,
      'Key Opportunity',
      'This business does not have a website listed on Google Business Profile. They may be losing leads that find them on Maps but cannot convert elsewhere.',
      DANGER,
      { r: 254, g: 242, b: 242 }
    );
  }

  if (payload.errorMessage) {
    drawHighlightBox(
      cursor,
      'Note',
      payload.errorMessage,
      WARNING,
      { r: 255, g: 251, b: 235 }
    );
  }

  drawExecutiveSummary(cursor, payload);

  drawSectionTitle(cursor, 'Profile Snapshot', 'Complete Google Business Profile data captured in this audit');
  drawSnapshotTable(cursor, payload.snapshotRows);

  drawSectionTitle(cursor, 'Audit Findings');
  drawFindingsSection(cursor, 'Critical Issues', payload.critical, DANGER);
  drawFindingsSection(cursor, 'Needs Improvement', payload.needsImprovement, WARNING);
  drawFindingsSection(cursor, 'Good', payload.good, SUCCESS);

  drawEnrichmentBlock(cursor, payload);
  drawReferenceLinks(cursor, payload);
  drawPageFooters(doc, payload);

  return doc.output('blob');
}
