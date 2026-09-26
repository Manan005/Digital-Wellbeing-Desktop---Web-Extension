/**
 * tools.ts
 * The structured query the chatbot works with, plus the code that runs it.
 *
 * Every understanding path (rules, on-device model, embedding classifier)
 * produces a `Query`; `runQuery` turns it into exact numbers via stats.ts.
 * The LLM never does arithmetic.
 */

import type { DateRange, RangePreset, RankMetric, RankOrder, UsageDataset } from '../utils/stats';
import { addDays, dateStrsBetween } from '../utils/storage';
import {
  loadUsage,
  siteSummary,
  rankSites,
  dailyTotals,
  overallSummary,
  compareRanges,
  hourlyPattern,
  longestSessions,
  goalStatus,
  listSites,
  resolveRange,
  type SiteSummary,
  type SiteTotals,
  type DailyTotal,
  type OverallSummary,
  type RangeComparison,
  type HourlyPattern,
  type SessionInfo,
  type GoalStatus,
} from '../utils/stats';

export const INTENTS = [
  'site_total_time',
  'site_avg_time',
  'site_visits',
  'most_used',
  'least_used',
  'overall_total',
  'overall_avg',
  'daily_breakdown',
  'compare',
  'peak_time',
  'longest_session',
  'goal',
  'list_sites',
  'help',
  'out_of_scope',
] as const;

export type Intent = (typeof INTENTS)[number];

export const RANGE_PRESETS: RangePreset[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'all',
];

export interface Query {
  intent: Intent;
  site?: string;
  /** Unresolved site the user named (never seen in the data). */
  siteMention?: string;
  range: DateRange;
  rangeB?: DateRange;
  metric: RankMetric;
  order: RankOrder;
  limit: number;
}

/** Sensible range when the user didn't name one. */
export const defaultRangeFor = (intent: Intent): DateRange => {
  switch (intent) {
    case 'site_total_time':
    case 'overall_total':
    case 'list_sites':
      return 'today';
    case 'compare':
      return 'thisWeek';
    default:
      return 'last7';
  }
};

/** The counterpart range for a comparison when only one was named (the equal-length period just before it). */
export const counterpartRange = (range: DateRange, today: string): DateRange => {
  if (range === 'today') return 'yesterday';
  if (range === 'thisWeek') return 'lastWeek';
  const r = resolveRange(range, today);
  if (range === 'thisMonth') {
    const prevEnd = addDays(r.from, -1);
    return { from: `${prevEnd.slice(0, 7)}-01`, to: prevEnd };
  }
  const len = dateStrsBetween(r.from, r.to).length;
  const to = addDays(r.from, -1);
  return { from: addDays(to, -(len - 1)), to };
};

// ─── JSON schema (used as Nano's responseConstraint) ─────────────────────────

export const QUERY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: [...INTENTS] },
    site: { type: 'string', description: 'website the question is about, e.g. youtube.com' },
    range: { type: 'string', enum: [...RANGE_PRESETS] },
    from: { type: 'string', description: 'YYYY-MM-DD start of a custom date range' },
    to: { type: 'string', description: 'YYYY-MM-DD end of a custom date range' },
    rangeB: { type: 'string', enum: [...RANGE_PRESETS], description: 'second range for compare' },
    metric: { type: 'string', enum: ['time', 'visits'] },
    order: { type: 'string', enum: ['most', 'least'] },
    limit: { type: 'integer', minimum: 1, maximum: 20 },
  },
  required: ['intent'],
  additionalProperties: false,
} as const;

/** Loose model output → validated partial query (site left as raw text for slots.ts to resolve). */
export const parseModelQuery = (raw: unknown): Partial<Query> | null => {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.intent !== 'string' || !(INTENTS as readonly string[]).includes(o.intent)) return null;
  const q: Partial<Query> = { intent: o.intent as Intent };
  if (typeof o.site === 'string' && o.site.trim()) q.siteMention = o.site.trim().toLowerCase();
  const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (isDate(o.from) && isDate(o.to)) q.range = { from: o.from, to: o.to };
  else if (isDate(o.from)) q.range = { from: o.from, to: o.from };
  else if (typeof o.range === 'string' && (RANGE_PRESETS as string[]).includes(o.range)) q.range = o.range as RangePreset;
  if (typeof o.rangeB === 'string' && (RANGE_PRESETS as string[]).includes(o.rangeB)) q.rangeB = o.rangeB as RangePreset;
  if (o.metric === 'time' || o.metric === 'visits') q.metric = o.metric;
  if (o.order === 'most' || o.order === 'least') q.order = o.order;
  if (typeof o.limit === 'number' && o.limit >= 1) q.limit = Math.min(20, Math.floor(o.limit));
  return q;
};

// ─── Execution ───────────────────────────────────────────────────────────────

export type QueryResult =
  | { intent: 'site_total_time' | 'site_avg_time' | 'site_visits'; site: string; summary: SiteSummary | null; days: DailyTotal[] }
  | { intent: 'most_used' | 'least_used'; sites: SiteTotals[]; totalSites: number }
  | { intent: 'overall_total' | 'overall_avg'; summary: OverallSummary }
  | { intent: 'daily_breakdown'; site?: string; days: DailyTotal[] }
  | { intent: 'compare'; comparison: RangeComparison }
  | { intent: 'peak_time'; site?: string; pattern: HourlyPattern }
  | { intent: 'longest_session'; site?: string; sessions: SessionInfo[] }
  | { intent: 'goal'; status: GoalStatus }
  | { intent: 'list_sites'; sites: SiteTotals[] }
  | { intent: 'help' }
  | { intent: 'out_of_scope' };

export type Loader = (range: DateRange) => Promise<UsageDataset>;

export const runQuery = async (query: Query, load: Loader = loadUsage): Promise<QueryResult & { query: Query; rangeLabel: string }> => {
  const rangeLabel = resolveRange(query.range).label;
  const withMeta = <T extends QueryResult>(r: T) => ({ ...r, query, rangeLabel });

  switch (query.intent) {
    case 'help':
      return withMeta({ intent: 'help' });
    case 'out_of_scope':
      return withMeta({ intent: 'out_of_scope' });
    case 'compare': {
      const [a, b] = await Promise.all([load(query.range), load(query.rangeB ?? counterpartRange(query.range, resolveRange('today').to))]);
      return withMeta({ intent: 'compare', comparison: compareRanges(a, b, query.site) });
    }
    default:
      break;
  }

  const ds = await load(query.range);
  switch (query.intent) {
    case 'site_total_time':
    case 'site_avg_time':
    case 'site_visits': {
      const site = query.site ?? query.siteMention ?? '';
      return withMeta({ intent: query.intent, site, summary: site ? siteSummary(ds, site) : null, days: site ? dailyTotals(ds, site) : [] });
    }
    case 'most_used':
    case 'least_used':
      return withMeta({
        intent: query.intent,
        sites: rankSites(ds, { metric: query.metric, order: query.order, limit: query.limit }),
        totalSites: listSites(ds).length,
      });
    case 'overall_total':
    case 'overall_avg':
      return withMeta({ intent: query.intent, summary: overallSummary(ds) });
    case 'daily_breakdown':
      return withMeta({ intent: 'daily_breakdown', site: query.site, days: dailyTotals(ds, query.site) });
    case 'peak_time':
      return withMeta({ intent: 'peak_time', site: query.site, pattern: hourlyPattern(ds, query.site) });
    case 'longest_session':
      return withMeta({ intent: 'longest_session', site: query.site, sessions: longestSessions(ds, { site: query.site, limit: query.limit }) });
    case 'goal':
      return withMeta({ intent: 'goal', status: goalStatus(ds) });
    case 'list_sites':
      return withMeta({ intent: 'list_sites', sites: listSites(ds) });
    default:
      return withMeta({ intent: 'help' });
  }
};
