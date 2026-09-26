/**
 * stats.ts
 * Pure query functions over the usage data in chrome.storage.local.
 * These are the "tools" the insights chatbot calls, and the dashboard reuses
 * them so both always agree on the numbers.
 *
 * Every function takes a `UsageDataset` loaded once via `loadUsage(range)` and
 * does no I/O itself, so all of them are unit-testable with fixture data.
 */

import type { DayData, DomainMetrics, SessionTuple } from './storage';
import {
  DEFAULT_GLOBAL_SETTINGS,
  addDays,
  dateStrsBetween,
  getLocalDateStr,
  parseDateStr,
  sessionKey,
} from './storage';

// ─── Ranges ──────────────────────────────────────────────────────────────────

export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'all';

export type DateRange = RangePreset | { from: string; to: string };

export interface ResolvedRange {
  from: string;
  to: string;
  label: string;
}

/** Longest range we ever look back (matches DAILY_RETENTION_DAYS). */
const ALL_TIME_DAYS = 365;

/** Monday of the week containing `dateStr`. */
const startOfWeek = (dateStr: string): string => {
  const dow = parseDateStr(dateStr).getDay(); // 0 = Sunday
  const daysSinceMonday = (dow + 6) % 7;
  return addDays(dateStr, -daysSinceMonday);
};

export const resolveRange = (range: DateRange, today: string = getLocalDateStr()): ResolvedRange => {
  if (typeof range !== 'string') {
    const from = range.from <= range.to ? range.from : range.to;
    const to = range.from <= range.to ? range.to : range.from;
    return { from, to, label: from === to ? `on ${from}` : `from ${from} to ${to}` };
  }
  switch (range) {
    case 'today':
      return { from: today, to: today, label: 'today' };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y, label: 'yesterday' };
    }
    case 'last7':
      return { from: addDays(today, -6), to: today, label: 'in the last 7 days' };
    case 'last30':
      return { from: addDays(today, -29), to: today, label: 'in the last 30 days' };
    case 'thisWeek':
      return { from: startOfWeek(today), to: today, label: 'this week' };
    case 'lastWeek': {
      const thisMonday = startOfWeek(today);
      return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1), label: 'last week' };
    }
    case 'thisMonth':
      return { from: `${today.slice(0, 7)}-01`, to: today, label: 'this month' };
    case 'all':
    default:
      return { from: addDays(today, -(ALL_TIME_DAYS - 1)), to: today, label: 'overall' };
  }
};

// ─── Dataset ─────────────────────────────────────────────────────────────────

export interface UsageDataset {
  range: ResolvedRange;
  /** Daily totals keyed by date; only dates inside `range` that have data. */
  days: Record<string, DayData>;
  /** Session logs keyed by date; only dates that have a log. */
  sessions: Record<string, SessionTuple[]>;
  dailyGoalMinutes: number;
}

/** Domains that are internal to the extension/browser and never count as usage. */
export const isTrackableDomain = (domain: string): boolean =>
  !domain.startsWith('chrome-extension://') && !domain.startsWith('chrome://') && domain.length > 0;

type StorageLike = { get: (keys: string[]) => Promise<Record<string, unknown>> };

/** One storage read for everything a range needs. */
export const loadUsage = async (
  range: DateRange,
  storage: StorageLike = chrome.storage.local
): Promise<UsageDataset> => {
  const resolved = resolveRange(range);
  const dates = dateStrsBetween(resolved.from, resolved.to);
  const keys = [...dates, ...dates.map(sessionKey), 'settings'];
  const raw = await storage.get(keys);
  return buildDataset(resolved, dates, raw);
};

export interface DatasetOptions {
  /** Keep the extension's own dashboard page in the data (the dashboard lists it; the chat does not). */
  includeInternal?: boolean;
}

/** Builds a dataset from an already-fetched storage snapshot (dashboard + tests). */
export const buildDataset = (
  resolved: ResolvedRange,
  dates: string[],
  raw: Record<string, unknown>,
  opts: DatasetOptions = {}
): UsageDataset => {
  const keep = (domain: string) => domain.length > 0 && (opts.includeInternal || isTrackableDomain(domain));
  const days: Record<string, DayData> = {};
  const sessions: Record<string, SessionTuple[]> = {};
  for (const date of dates) {
    const day = raw[date];
    if (day && typeof day === 'object') {
      const filtered: DayData = {};
      for (const [domain, metrics] of Object.entries(day as DayData)) {
        if (keep(domain) && (metrics.timeSpentSeconds || 0) > 0) filtered[domain] = metrics;
      }
      if (Object.keys(filtered).length > 0) days[date] = filtered;
    }
    const log = raw[sessionKey(date)];
    if (Array.isArray(log)) {
      sessions[date] = (log as SessionTuple[]).filter((s) => keep(s[0]));
    }
  }
  const settings = (raw.settings as { dailyGoal?: number } | undefined) || {};
  return {
    range: resolved,
    days,
    sessions,
    dailyGoalMinutes: Number(settings.dailyGoal ?? DEFAULT_GLOBAL_SETTINGS.dailyGoal),
  };
};

export const datasetFromSnapshot = (
  range: DateRange,
  snapshot: Record<string, unknown>,
  today: string = getLocalDateStr(),
  opts: DatasetOptions = {}
): UsageDataset => {
  const resolved = resolveRange(range, today);
  return buildDataset(resolved, dateStrsBetween(resolved.from, resolved.to), snapshot, opts);
};

// ─── Internal helpers ────────────────────────────────────────────────────────

const daysInRange = (ds: UsageDataset): number => dateStrsBetween(ds.range.from, ds.range.to).length;

const sortedDates = (ds: UsageDataset): string[] => Object.keys(ds.days).sort();

/**
 * Visits for a domain on a date. Uses the session log when the day has one
 * (accurate), otherwise falls back to the coarse `timesOpened` counter.
 */
const visitsOn = (ds: UsageDataset, date: string, domain: string, metrics?: DomainMetrics): number => {
  const log = ds.sessions[date];
  if (log) return log.reduce((n, s) => n + (s[0] === domain ? 1 : 0), 0);
  return metrics?.timesOpened ?? ds.days[date]?.[domain]?.timesOpened ?? 0;
};

const avg = (total: number, count: number): number => (count > 0 ? Math.round(total / count) : 0);

// ─── Queries ─────────────────────────────────────────────────────────────────

export interface SiteTotals {
  site: string;
  totalSeconds: number;
  visits: number;
  activeDays: number;
}

/** Every site used in the range, most time first. */
export const listSites = (ds: UsageDataset): SiteTotals[] => {
  const totals = new Map<string, SiteTotals>();
  for (const [date, day] of Object.entries(ds.days)) {
    for (const [site, metrics] of Object.entries(day)) {
      const t = totals.get(site) || { site, totalSeconds: 0, visits: 0, activeDays: 0 };
      t.totalSeconds += metrics.timeSpentSeconds;
      t.visits += visitsOn(ds, date, site, metrics);
      t.activeDays += 1;
      totals.set(site, t);
    }
  }
  return [...totals.values()].sort((a, b) => b.totalSeconds - a.totalSeconds);
};

export const knownDomains = (ds: UsageDataset): string[] => listSites(ds).map((s) => s.site);

export interface DailyTotal {
  date: string;
  seconds: number;
  visits: number;
}

/** Seconds and visits per calendar day in the range (zero-filled). */
export const dailyTotals = (ds: UsageDataset, site?: string): DailyTotal[] =>
  dateStrsBetween(ds.range.from, ds.range.to).map((date) => {
    const day = ds.days[date] || {};
    let seconds = 0;
    let visits = 0;
    for (const [domain, metrics] of Object.entries(day)) {
      if (site && domain !== site) continue;
      seconds += metrics.timeSpentSeconds;
      visits += visitsOn(ds, date, domain, metrics);
    }
    return { date, seconds, visits };
  });

export interface SiteSummary extends SiteTotals {
  daysInRange: number;
  avgPerDaySeconds: number;
  avgPerActiveDaySeconds: number;
  avgVisitsPerActiveDay: number;
  peakDay: DailyTotal | null;
  shareOfTotal: number; // 0..1
}

export const siteSummary = (ds: UsageDataset, site: string): SiteSummary | null => {
  const totals = listSites(ds).find((s) => s.site === site);
  if (!totals) return null;
  const perDay = dailyTotals(ds, site).filter((d) => d.seconds > 0);
  const peakDay = perDay.reduce<DailyTotal | null>((best, d) => (!best || d.seconds > best.seconds ? d : best), null);
  const grand = listSites(ds).reduce((n, s) => n + s.totalSeconds, 0);
  const n = daysInRange(ds);
  return {
    ...totals,
    daysInRange: n,
    avgPerDaySeconds: avg(totals.totalSeconds, n),
    avgPerActiveDaySeconds: avg(totals.totalSeconds, totals.activeDays),
    avgVisitsPerActiveDay: totals.activeDays > 0 ? Math.round((totals.visits / totals.activeDays) * 10) / 10 : 0,
    peakDay,
    shareOfTotal: grand > 0 ? totals.totalSeconds / grand : 0,
  };
};

export type RankMetric = 'time' | 'visits';
export type RankOrder = 'most' | 'least';

export const rankSites = (
  ds: UsageDataset,
  opts: { metric?: RankMetric; order?: RankOrder; limit?: number } = {}
): SiteTotals[] => {
  const { metric = 'time', order = 'most', limit = 5 } = opts;
  const key = metric === 'time' ? 'totalSeconds' : 'visits';
  const sites = listSites(ds).sort((a, b) => (order === 'most' ? b[key] - a[key] : a[key] - b[key]));
  return sites.slice(0, Math.max(1, limit));
};

export interface OverallSummary {
  totalSeconds: number;
  visits: number;
  siteCount: number;
  activeDays: number;
  daysInRange: number;
  avgPerDaySeconds: number;
  avgPerActiveDaySeconds: number;
  busiestDay: DailyTotal | null;
  quietestDay: DailyTotal | null; // among active days
  topSite: SiteTotals | null;
}

export const overallSummary = (ds: UsageDataset): OverallSummary => {
  const sites = listSites(ds);
  const totalSeconds = sites.reduce((n, s) => n + s.totalSeconds, 0);
  const visits = sites.reduce((n, s) => n + s.visits, 0);
  const active = dailyTotals(ds).filter((d) => d.seconds > 0);
  const n = daysInRange(ds);
  return {
    totalSeconds,
    visits,
    siteCount: sites.length,
    activeDays: active.length,
    daysInRange: n,
    avgPerDaySeconds: avg(totalSeconds, n),
    avgPerActiveDaySeconds: avg(totalSeconds, active.length),
    busiestDay: active.reduce<DailyTotal | null>((b, d) => (!b || d.seconds > b.seconds ? d : b), null),
    quietestDay: active.reduce<DailyTotal | null>((b, d) => (!b || d.seconds < b.seconds ? d : b), null),
    topSite: sites[0] || null,
  };
};

export interface RangeComparison {
  site?: string;
  a: { label: string; totalSeconds: number; avgPerDaySeconds: number; visits: number };
  b: { label: string; totalSeconds: number; avgPerDaySeconds: number; visits: number };
  deltaSeconds: number; // a - b
  deltaPercent: number | null; // null when b is zero
}

const rangeFigures = (ds: UsageDataset, site?: string) => {
  const totals = site ? listSites(ds).filter((s) => s.site === site) : listSites(ds);
  const totalSeconds = totals.reduce((n, s) => n + s.totalSeconds, 0);
  return {
    label: ds.range.label,
    totalSeconds,
    avgPerDaySeconds: avg(totalSeconds, daysInRange(ds)),
    visits: totals.reduce((n, s) => n + s.visits, 0),
  };
};

export const compareRanges = (a: UsageDataset, b: UsageDataset, site?: string): RangeComparison => {
  const fa = rangeFigures(a, site);
  const fb = rangeFigures(b, site);
  const deltaSeconds = fa.totalSeconds - fb.totalSeconds;
  return {
    site,
    a: fa,
    b: fb,
    deltaSeconds,
    deltaPercent: fb.totalSeconds > 0 ? Math.round((deltaSeconds / fb.totalSeconds) * 100) : null,
  };
};

export interface HourlyPattern {
  /** Seconds of use starting in each local hour, index 0..23. */
  hours: number[];
  peakHour: number | null;
  hasSessionData: boolean;
}

/** Distributes each session's seconds across the local hours it spans. */
export const hourlyPattern = (ds: UsageDataset, site?: string): HourlyPattern => {
  const hours = new Array<number>(24).fill(0);
  let any = false;
  for (const log of Object.values(ds.sessions)) {
    for (const [domain, start, duration] of log) {
      if (site && domain !== site) continue;
      any = true;
      let t = start;
      let remaining = duration;
      while (remaining > 0) {
        const d = new Date(t * 1000);
        const secsToHourEnd = 3600 - (d.getMinutes() * 60 + d.getSeconds());
        const chunk = Math.min(remaining, secsToHourEnd);
        hours[d.getHours()] += chunk;
        t += chunk;
        remaining -= chunk;
      }
    }
  }
  const max = Math.max(...hours);
  return { hours, peakHour: max > 0 ? hours.indexOf(max) : null, hasSessionData: any };
};

export interface SessionInfo {
  site: string;
  date: string;
  startEpochSec: number;
  durationSeconds: number;
}

export const longestSessions = (
  ds: UsageDataset,
  opts: { site?: string; limit?: number } = {}
): SessionInfo[] => {
  const { site, limit = 3 } = opts;
  const all: SessionInfo[] = [];
  for (const [date, log] of Object.entries(ds.sessions)) {
    for (const [domain, start, duration] of log) {
      if (site && domain !== site) continue;
      all.push({ site: domain, date, startEpochSec: start, durationSeconds: duration });
    }
  }
  return all.sort((a, b) => b.durationSeconds - a.durationSeconds).slice(0, Math.max(1, limit));
};

export interface GoalStatus {
  goalMinutes: number;
  daysOver: DailyTotal[];
  daysUnder: DailyTotal[]; // active days under the goal
  activeDays: number;
  /** Consecutive active days up to the latest one that stayed under the goal. */
  currentStreakUnder: number;
}

export const goalStatus = (ds: UsageDataset): GoalStatus => {
  const goalSeconds = ds.dailyGoalMinutes * 60;
  const active = dailyTotals(ds).filter((d) => d.seconds > 0);
  const daysOver = active.filter((d) => d.seconds > goalSeconds);
  const daysUnder = active.filter((d) => d.seconds <= goalSeconds);
  let streak = 0;
  for (let i = active.length - 1; i >= 0 && active[i].seconds <= goalSeconds; i--) streak++;
  return { goalMinutes: ds.dailyGoalMinutes, daysOver, daysUnder, activeDays: active.length, currentStreakUnder: streak };
};

/** Convenience for the dashboard: sites used on one date, most time first. */
export const sitesOnDate = (ds: UsageDataset, date: string): [string, DomainMetrics][] =>
  Object.entries(ds.days[date] || {}).sort((a, b) => b[1].timeSpentSeconds - a[1].timeSpentSeconds);

export { sortedDates as activeDates };
