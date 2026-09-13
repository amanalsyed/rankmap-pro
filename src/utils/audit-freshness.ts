/** Days after which an audit is considered potentially outdated. */
export const STALE_AUDIT_DAYS = 14;

export function formatAuditAge(auditedAt: string | null | undefined): string | null {
  if (!auditedAt) return null;
  const then = new Date(auditedAt);
  if (Number.isNaN(then.getTime())) return null;

  const diffMs = Date.now() - then.getTime();
  if (diffMs < 0) return 'Audited just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Audited just now';
  if (minutes < 60) return minutes === 1 ? 'Audited 1 min ago' : `Audited ${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'Audited 1 hour ago' : `Audited ${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Audited yesterday';
  if (days < 30) return `Audited ${days} days ago`;

  const months = Math.floor(days / 30);
  if (months === 1) return 'Audited 1 month ago';
  if (months < 12) return `Audited ${months} months ago`;

  const years = Math.floor(days / 365);
  return years === 1 ? 'Audited 1 year ago' : `Audited ${years} years ago`;
}

export function isAuditStale(
  auditedAt: string | null | undefined,
  staleDays = STALE_AUDIT_DAYS
): boolean {
  if (!auditedAt) return false;
  const then = new Date(auditedAt);
  if (Number.isNaN(then.getTime())) return false;
  const ageDays = (Date.now() - then.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays >= staleDays;
}

export function getAuditFreshness(auditedAt: string | null | undefined): {
  ageLabel: string | null;
  isStale: boolean;
} {
  return {
    ageLabel: formatAuditAge(auditedAt),
    isStale: isAuditStale(auditedAt),
  };
}
