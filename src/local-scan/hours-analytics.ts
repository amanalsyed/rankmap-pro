import type { LocalScanBusiness } from './types';

export interface ParsedDayHours {
  day: string;
  open: string;
  close: string;
  isClosed: boolean;
  is24Hours: boolean;
}

export interface BusinessHoursAnalysis {
  business: LocalScanBusiness;
  days: ParsedDayHours[];
  earliestOpen: string | null;
  latestClose: string | null;
  weeklyOpenDays: number;
  weeklyClosedDays: number;
  totalWeeklyHours: number | null;
}

export interface PackHoursAnalytics {
  businesses: BusinessHoursAnalysis[];
  avgWeeklyHours: number | null;
  earliestOpenOverall: string | null;
  latestCloseOverall: string | null;
  open24Count: number;
  withHoursCount: number;
}

export type HoursDayKey =
  | 'present'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export const HOURS_DAY_OPTIONS: Array<{ key: HoursDayKey; label: string }> = [
  { key: 'present', label: 'Present Day' },
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const WEEKDAY_ALIASES: Record<string, HoursDayKey> = {
  mon: 'monday',
  monday: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  tuesday: 'tuesday',
  wed: 'wednesday',
  wednesday: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  thursday: 'thursday',
  fri: 'friday',
  friday: 'friday',
  sat: 'saturday',
  saturday: 'saturday',
  sun: 'sunday',
  sunday: 'sunday',
};

const WEEKDAY_FROM_DATE: HoursDayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export interface DayHoursView {
  dayEntry: ParsedDayHours | null;
  pattern: string;
  hasTiming: boolean;
  dailyHours: number | null;
}

export interface DayHoursSummary {
  withTiming: number;
  noTiming: number;
  open24Count: number;
  closedCount: number;
  uniquePatterns: number;
  earliestOpen: string | null;
  latestClose: string | null;
}

export interface HoursPatternGroup {
  pattern: string;
  count: number;
  share: number;
  ranks: number[];
}

export interface DayHoursAnalytics {
  dayKey: HoursDayKey;
  dayLabel: string;
  summary: DayHoursSummary;
  hourlyDistribution: Array<{ hour: number; label: string; count: number }>;
  comparisonPoints: Array<{ rank: number; name: string; hours: number; placeId: string }>;
  businessRows: Array<{
    rank: number;
    name: string;
    placeId: string;
    dayHours: string;
    weeklyHours: number | null;
    hasTiming: boolean;
  }>;
  patterns: HoursPatternGroup[];
}

function parseTimeToMinutes(value: string): number | null {
  const clean = value.trim().toLowerCase();
  if (!clean || /closed/i.test(clean)) return null;
  if (/open 24|24 hours|24\/7|24 hrs?/i.test(clean)) return 0;

  const match = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (!meridiem && hours <= 12 && /pm/i.test(clean)) hours = hours === 12 ? 12 : hours + 12;

  return hours * 60 + minutes;
}

export function minutesToLabel(total: number): string {
  const hours24 = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  return minutes > 0 ? `${hours12}:${String(minutes).padStart(2, '0')} ${meridiem}` : `${hours12} ${meridiem}`;
}

function compactTimeLabel(value: string): string {
  const minutes = parseTimeToMinutes(value);
  if (minutes == null) return value.trim();
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  if (mins === 0) return `${hours12}${meridiem}`;
  return `${hours12}:${String(mins).padStart(2, '0')}${meridiem}`;
}

function parseDaySegment(segment: string): ParsedDayHours | null {
  const trimmed = segment.trim();
  if (!trimmed) return null;

  // Support both "Wednesday: 8 AM" and "Wednesday, 8 AM" formats
  let separatorIdx = trimmed.indexOf(':');
  if (separatorIdx === -1) {
    separatorIdx = trimmed.indexOf(',');
  }
  if (separatorIdx === -1) return null;

  const day = trimmed.slice(0, separatorIdx).trim();
  const hoursText = trimmed.slice(separatorIdx + 1).trim();
  const isClosed = /closed/i.test(hoursText);
  const is24Hours = /open 24|24 hours|24\/7|24 hrs?/i.test(hoursText);

  if (isClosed) {
    return { day, open: '—', close: '—', isClosed: true, is24Hours: false };
  }

  if (is24Hours) {
    return { day, open: 'Open 24 hours', close: 'Open 24 hours', isClosed: false, is24Hours: true };
  }

  const parts = hoursText.split(/[–—-]/).map((p) => p.trim()).filter(Boolean);
  const open = parts[0] ?? hoursText;
  const close = parts[1] ?? '—';

  return { day, open, close, isClosed: false, is24Hours: false };
}

export function parseBusinessHours(hours: string): ParsedDayHours[] {
  if (!hours.trim()) return [];
  return hours
    .split(';')
    .map(parseDaySegment)
    .filter((d): d is ParsedDayHours => d != null);
}

export function resolveHoursDayKey(dayKey: HoursDayKey): HoursDayKey {
  if (dayKey !== 'present') return dayKey;
  return WEEKDAY_FROM_DATE[new Date().getDay()];
}

export function resolveHoursDayLabel(dayKey: HoursDayKey): string {
  if (dayKey === 'present') {
    const resolved = resolveHoursDayKey('present');
    const label = HOURS_DAY_OPTIONS.find((d) => d.key === resolved)?.label ?? resolved;
    return `Present Day (${label})`;
  }
  return HOURS_DAY_OPTIONS.find((d) => d.key === dayKey)?.label ?? dayKey;
}

function normalizeWeekday(day: string): HoursDayKey | null {
  const key = day.trim().toLowerCase().replace(/\./g, '');
  return WEEKDAY_ALIASES[key] ?? null;
}

export function getDayEntry(days: ParsedDayHours[], dayKey: HoursDayKey): ParsedDayHours | null {
  const resolved = resolveHoursDayKey(dayKey);
  for (const entry of days) {
    const weekday = normalizeWeekday(entry.day);
    if (weekday === resolved) return entry;
  }
  return null;
}

export function formatDayPattern(dayEntry: ParsedDayHours | null, hasHoursData: boolean): string {
  if (!hasHoursData) return 'No timing';
  if (!dayEntry) return 'No timing';
  if (dayEntry.isClosed) return 'Closed';
  if (dayEntry.is24Hours) return '24 Hours';
  const open = compactTimeLabel(dayEntry.open);
  const close = compactTimeLabel(dayEntry.close);
  if (!open || close === '—') return 'No timing';
  return `${open}-${close}`;
}

export function dailyOpenHours(dayEntry: ParsedDayHours | null): number | null {
  if (!dayEntry || dayEntry.isClosed) return 0;
  if (dayEntry.is24Hours) return 24;
  const openMin = parseTimeToMinutes(dayEntry.open);
  let closeMin = parseTimeToMinutes(dayEntry.close);
  if (openMin == null || closeMin == null) return null;
  if (closeMin <= openMin) closeMin += 24 * 60;
  return Math.round(((closeMin - openMin) / 60) * 10) / 10;
}

export function isOpenAtHour(dayEntry: ParsedDayHours | null, hour: number): boolean {
  if (!dayEntry || dayEntry.isClosed) return false;
  if (dayEntry.is24Hours) return true;
  const openMin = parseTimeToMinutes(dayEntry.open);
  let closeMin = parseTimeToMinutes(dayEntry.close);
  if (openMin == null || closeMin == null) return false;
  const target = hour * 60;
  if (closeMin > openMin) return target >= openMin && target < closeMin;
  return target >= openMin || target < closeMin;
}

export function getDayHoursView(analysis: BusinessHoursAnalysis, dayKey: HoursDayKey): DayHoursView {
  const hasHoursData = analysis.days.length > 0;
  const dayEntry = getDayEntry(analysis.days, dayKey);
  const pattern = formatDayPattern(dayEntry, hasHoursData);
  const hasTiming = hasHoursData && dayEntry != null && pattern !== 'No timing';
  return {
    dayEntry,
    pattern,
    hasTiming,
    dailyHours: dailyOpenHours(dayEntry),
  };
}

function pickEarliestOpen(entries: ParsedDayHours[]): string | null {
  const minutes = entries
    .filter((e) => !e.isClosed && !e.is24Hours)
    .map((e) => parseTimeToMinutes(e.open))
    .filter((v): v is number => v != null);
  if (!minutes.length) return null;
  return minutesToLabel(Math.min(...minutes));
}

function pickLatestClose(entries: ParsedDayHours[]): string | null {
  const minutes = entries
    .filter((e) => !e.isClosed && !e.is24Hours)
    .map((e) => parseTimeToMinutes(e.close))
    .filter((v): v is number => v != null);
  if (!minutes.length) return null;
  return minutesToLabel(Math.max(...minutes));
}

export function analyzeBusinessHours(business: LocalScanBusiness): BusinessHoursAnalysis {
  const days = parseBusinessHours(business.hours ?? '');
  const openMinutes: number[] = [];
  const closeMinutes: number[] = [];
  let weeklyOpenDays = 0;
  let weeklyClosedDays = 0;
  let totalWeeklyMinutes = 0;
  let hasDuration = false;

  for (const day of days) {
    if (day.isClosed) {
      weeklyClosedDays++;
      continue;
    }
    weeklyOpenDays++;
    if (day.is24Hours) {
      totalWeeklyMinutes += 24 * 60;
      hasDuration = true;
      continue;
    }
    const openMin = parseTimeToMinutes(day.open);
    const closeMin = parseTimeToMinutes(day.close);
    if (openMin != null) openMinutes.push(openMin);
    if (closeMin != null) closeMinutes.push(closeMin);
    if (openMin != null && closeMin != null) {
      let duration = closeMin - openMin;
      if (duration < 0) duration += 24 * 60;
      totalWeeklyMinutes += duration;
      hasDuration = true;
    }
  }

  return {
    business,
    days,
    earliestOpen: openMinutes.length ? minutesToLabel(Math.min(...openMinutes)) : null,
    latestClose: closeMinutes.length ? minutesToLabel(Math.max(...closeMinutes)) : null,
    weeklyOpenDays,
    weeklyClosedDays,
    totalWeeklyHours: hasDuration ? Math.round((totalWeeklyMinutes / 60) * 10) / 10 : null,
  };
}

export function analyzePackHours(businesses: LocalScanBusiness[]): PackHoursAnalytics {
  const analyses = businesses.map(analyzeBusinessHours);
  const withHours = analyses.filter((a) => a.days.length > 0);
  const weeklyTotals = withHours
    .map((a) => a.totalWeeklyHours)
    .filter((v): v is number => v != null);

  const earliestMinutes = withHours
    .flatMap((a) =>
      a.days
        .filter((d) => !d.isClosed && !d.is24Hours)
        .map((d) => parseTimeToMinutes(d.open))
        .filter((v): v is number => v != null)
    );
  const latestMinutes = withHours
    .flatMap((a) =>
      a.days
        .filter((d) => !d.isClosed && !d.is24Hours)
        .map((d) => parseTimeToMinutes(d.close))
        .filter((v): v is number => v != null)
    );

  return {
    businesses: analyses,
    withHoursCount: withHours.length,
    open24Count: analyses.filter((a) => a.days.some((d) => d.is24Hours)).length,
    avgWeeklyHours:
      weeklyTotals.length > 0
        ? Math.round((weeklyTotals.reduce((a, b) => a + b, 0) / weeklyTotals.length) * 10) / 10
        : null,
    earliestOpenOverall: earliestMinutes.length ? minutesToLabel(Math.min(...earliestMinutes)) : null,
    latestCloseOverall: latestMinutes.length ? minutesToLabel(Math.max(...latestMinutes)) : null,
  };
}

export function analyzeDayHours(
  analyses: BusinessHoursAnalysis[],
  dayKey: HoursDayKey,
  totalBusinesses: number
): DayHoursAnalytics {
  const views = analyses.map((analysis) => ({
    analysis,
    view: getDayHoursView(analysis, dayKey),
  }));

  const dayEntriesForBounds = views
    .map((row) => row.view.dayEntry)
    .filter((entry): entry is ParsedDayHours => entry != null);

  const summary: DayHoursSummary = {
    withTiming: views.filter((row) => row.view.hasTiming).length,
    noTiming: totalBusinesses - views.filter((row) => row.view.hasTiming).length,
    open24Count: views.filter((row) => row.view.dayEntry?.is24Hours).length,
    closedCount: views.filter((row) => row.view.dayEntry?.isClosed).length,
    uniquePatterns: new Set(views.map((row) => row.view.pattern)).size,
    earliestOpen: pickEarliestOpen(dayEntriesForBounds.filter((e) => !e.is24Hours && !e.isClosed)),
    latestClose: pickLatestClose(dayEntriesForBounds.filter((e) => !e.is24Hours && !e.isClosed)),
  };

  const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${hour}:00`,
    count: views.filter((row) => isOpenAtHour(row.view.dayEntry, hour)).length,
  }));

  const comparisonPoints = views
    .map((row) => ({
      rank: row.analysis.business.rank,
      name: row.analysis.business.name,
      placeId: row.analysis.business.placeId,
      hours: row.view.dailyHours ?? 0,
    }))
    .sort((a, b) => a.rank - b.rank);

  const businessRows = views
    .map((row) => ({
      rank: row.analysis.business.rank,
      name: row.analysis.business.name,
      placeId: row.analysis.business.placeId,
      dayHours: row.view.pattern,
      weeklyHours: row.analysis.totalWeeklyHours,
      hasTiming: row.view.hasTiming,
    }))
    .sort((a, b) => a.rank - b.rank);

  const patternMap = new Map<string, number[]>();
  for (const row of businessRows) {
    const ranks = patternMap.get(row.dayHours) ?? [];
    ranks.push(row.rank);
    patternMap.set(row.dayHours, ranks);
  }

  const patterns: HoursPatternGroup[] = [...patternMap.entries()]
    .map(([pattern, ranks]) => ({
      pattern,
      count: ranks.length,
      share: Math.round((ranks.length / (totalBusinesses || 1)) * 1000) / 10,
      ranks: ranks.sort((a, b) => a - b),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    dayKey,
    dayLabel: resolveHoursDayLabel(dayKey),
    summary,
    hourlyDistribution,
    comparisonPoints,
    businessRows,
    patterns,
  };
}

export function copyBusinessHoursList(rows: DayHoursAnalytics['businessRows']): string {
  return rows
    .map((row) => `#${row.rank} ${row.name} — ${row.dayHours}${row.weeklyHours != null ? ` (${row.weeklyHours} hrs/week)` : ''}`)
    .join('\n');
}

export function copyHoursPatterns(patterns: HoursPatternGroup[], totalBusinesses: number): string {
  return patterns
    .map(
      (p) =>
        `${p.pattern} — ${p.count}/${totalBusinesses} (${p.share}%) · ranks ${p.ranks.join(', ')}`
    )
    .join('\n');
}
