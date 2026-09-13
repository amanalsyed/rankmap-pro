import { jsPDF } from 'jspdf';
import type { LocalScanSession } from './types';
import { aggregatePrimaryCategoryFrequency, aggregateReviewStats, formatDistanceKm } from './aggregate';

const MARGIN = 48;

export function downloadLocalScanPdf(session: LocalScanSession): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = MARGIN;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;

  const addLine = (text: string, size = 10, bold = false) => {
    if (y > doc.internal.pageSize.getHeight() - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    doc.text(lines, MARGIN, y);
    y += lines.length * (size + 4);
  };

  addLine('Local Scan Report', 18, true);
  addLine(`${session.context.keyword} · ${session.mode === 'deep' ? 'Deep scan' : 'Quick scan'} · ${session.businesses.length} businesses`);
  addLine(`Generated ${new Date(session.createdAt).toLocaleString()}`);

  const reviewStats = aggregateReviewStats(session.businesses);
  const catFreq = aggregatePrimaryCategoryFrequency(session.businesses).slice(0, 8);

  y += 8;
  addLine('Summary', 13, true);
  addLine(`Avg rating: ${reviewStats.avgRating ?? '—'} · Avg reviews: ${reviewStats.avgReviews ?? '—'}`);
  addLine(`With website: ${session.businesses.filter((b) => b.hasWebsite).length} · Without: ${session.businesses.filter((b) => !b.hasWebsite).length}`);
  if (catFreq.length) {
    addLine(`Top categories: ${catFreq.map((c) => `${c.name} (${c.count})`).join(', ')}`);
  }

  y += 8;
  addLine('Businesses', 13, true);

  for (const business of session.businesses) {
    y += 4;
    addLine(
      `#${business.rank} ${business.name}`,
      11,
      true
    );
    addLine(
      [
        business.primaryCategory || 'No category',
        business.rating != null ? `${business.rating}★` : null,
        business.reviewCount != null ? `${business.reviewCount} reviews` : null,
        business.hasWebsite ? 'Has website' : 'No website',
        formatDistanceKm(business.distanceKm),
      ]
        .filter(Boolean)
        .join(' · ')
    );
    if (business.address) addLine(business.address, 9);
    if (business.services.length) addLine(`Services: ${business.services.slice(0, 6).join(', ')}`, 9);
    if (business.attributes.length) addLine(`Attributes: ${business.attributes.slice(0, 6).join('; ')}`, 9);
  }

  if (session.search3Pack?.length) {
    y += 8;
    addLine('Google Search 3-pack', 13, true);
    for (const entry of session.search3Pack) {
      addLine(`#${entry.rank} ${entry.name} · ${entry.category || '—'} · ${entry.rating ?? '—'}★`);
    }
  }

  const safeKeyword = session.context.keyword.replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
  doc.save(`local-scan-${safeKeyword}-${session.id.slice(0, 8)}.pdf`);
}
