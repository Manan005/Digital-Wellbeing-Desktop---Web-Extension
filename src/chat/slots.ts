/**
 * slots.ts
 * Deterministic extraction of the parameters in a question: which site, which
 * date range(s), time vs visits, most vs least, and a count. Every
 * understanding path uses this so parameters never depend on a model.
 */

import type { DateRange } from '../utils/stats';
import type { RankMetric, RankOrder } from '../utils/stats';
import { addDays, getLocalDateStr, parseDateStr, toLocalDateStr } from '../utils/storage';

export interface Slots {
  site?: string;
  /** Something that looked like a site but isn't in the data. */
  siteMention?: string;
  range?: DateRange;
  rangeB?: DateRange;
  metric?: RankMetric;
  order?: RankOrder;
  limit?: number;
  /** True when the question has a comparison cue (vs, than, compared to…). */
  compare: boolean;
}

// ─── Site resolution ─────────────────────────────────────────────────────────

/** Short names people use → the site's canonical name (matched against known domains). */
const ALIASES: Record<string, string> = {
  yt: 'youtube',
  youtube: 'youtube',
  insta: 'instagram',
  ig: 'instagram',
  fb: 'facebook',
  gh: 'github',
  so: 'stackoverflow',
  'stack overflow': 'stackoverflow',
  twitter: 'x',
  gmail: 'mail.google',
  'google mail': 'mail.google',
  wiki: 'wikipedia',
  wikipedia: 'wikipedia',
  chatgpt: 'chatgpt',
  gpt: 'chatgpt',
  claude: 'claude',
  netflix: 'netflix',
  reddit: 'reddit',
  linkedin: 'linkedin',
  whatsapp: 'whatsapp',
  amazon: 'amazon',
  discord: 'discord',
  tiktok: 'tiktok',
  notion: 'notion',
  figma: 'figma',
  docs: 'docs.google',
  'google docs': 'docs.google',
  sheets: 'sheets.google',
  drive: 'drive.google',
  maps: 'maps.google',
  meet: 'meet.google',
  google: 'google',
};

const TLD_RE = /\.(com|org|net|io|co|dev|app|ai|edu|gov|in|uk|de|fr|jp|ru|br|ca|au|tv|me|info|xyz|gg|so|to|us)(\.[a-z]{2})?$/;

/** "youtube.com" → "youtube", "mail.google.com" → "mail.google". */
export const siteName = (domain: string): string => domain.toLowerCase().replace(TLD_RE, '');

const STOPWORDS = new Set([
  'what', 'which', 'when', 'where', 'how', 'many', 'much', 'long', 'time', 'times', 'spent', 'spend', 'did',
  'have', 'has', 'been', 'was', 'were', 'the', 'this', 'that', 'these', 'those', 'last', 'past', 'week',
  'weeks', 'day', 'days', 'month', 'today', 'yesterday', 'site', 'sites', 'website', 'websites', 'app', 'apps',
  'tab', 'tabs', 'open', 'opened', 'visit', 'visited', 'most', 'least', 'used', 'use', 'using', 'average',
  'avg', 'total', 'overall', 'screen', 'browser', 'hours', 'hour', 'minutes', 'minute', 'and', 'with', 'for',
  'from', 'about', 'than', 'versus', 'compare', 'compared', 'show', 'tell', 'give', 'list', 'all', 'daily',
  'goal', 'limit', 'longest', 'session', 'peak', 'usually', 'often', 'more', 'less', 'top', 'first', 'only',
  'per', 'each', 'every', 'ever', 'far', 'so', 'do', 'does', 'am', 'is', 'are', 'my', 'me', 'i', 'on', 'in',
  'at', 'of', 'to', 'a', 'an', 'it', 'up', 'down', 'over', 'under', 'between', 'during', 'since', 'until',
  'before', 'after', 'now', 'then', 'still', 'again', 'also', 'just', 'like', 'really', 'very', 'you', 'your',
  'we', 'our', 'they', 'their', 'them', 'he', 'she', 'his', 'her', 'its', 'not', 'no', 'yes', 'or', 'but',
  'if', 'because', 'while', 'there', 'here', 'out', 'off', 'into', 'onto', 'any', 'some', 'few', 'lot', 'lots',
  'number', 'count', 'browse', 'browsing', 'browsed', 'online', 'internet', 'web', 'page', 'pages', 'usage',
  'activity', 'active', 'busiest', 'quietest', 'biggest', 'lowest', 'highest', 'rarely', 'barely', 'never',
  'always', 'morning', 'evening', 'night', 'afternoon', 'noon', 'midnight', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday', 'sunday', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'stayed', 'stay',
  'trend', 'breakdown', 'compare', 'difference', 'target', 'budget', 'meet', 'met', 'exceed', 'exceeded',
]);

const levenshtein = (a: string, b: string): number => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
};

/** Finds the known domain whose name best matches `name` (exact, then contains, then fuzzy). */
const matchDomainByName = (name: string, knownDomains: string[]): string | undefined => {
  const exact = knownDomains.find((d) => d.toLowerCase() === name || siteName(d) === name);
  if (exact) return exact;
  if (name.length < 2) return undefined;
  // "google" should prefer google.com over mail.google.com
  const byLastLabel = knownDomains.find((d) => siteName(d).split('.').pop() === name && !siteName(d).includes('.'));
  if (byLastLabel) return byLastLabel;
  const contains = knownDomains.find((d) => siteName(d).split('.').includes(name));
  if (contains) return contains;
  if (name.length >= 4) {
    const prefix = knownDomains.find((d) => {
      const n = siteName(d).split('.').pop() || '';
      return n.startsWith(name) || (name.startsWith(n) && n.length >= 4);
    });
    if (prefix) return prefix;
  }
  if (name.length >= 5) {
    const fuzzy = knownDomains.find((d) => levenshtein(siteName(d).split('.').pop() || '', name) <= 1);
    if (fuzzy) return fuzzy;
  }
  return undefined;
};

export interface SiteMatch {
  site?: string;
  siteMention?: string;
  /** [start, end) of the matched text in the lower-cased question. */
  span?: [number, number];
}

export const resolveSite = (question: string, knownDomains: string[]): SiteMatch => {
  const q = question.toLowerCase();

  // 1. A full domain typed out ("youtube.com", "mail.google.com")
  const domainMatch = q.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\b/);
  if (domainMatch && domainMatch.index !== undefined) {
    const typed = domainMatch[1].replace(/^www\./, '');
    const span: [number, number] = [domainMatch.index, domainMatch.index + domainMatch[0].length];
    const site = knownDomains.find((d) => d.toLowerCase() === typed) ?? matchDomainByName(siteName(typed), knownDomains);
    return site ? { site, span } : { siteMention: typed, span };
  }

  // 2. Aliases (longest phrases first so "google docs" beats "google")
  const aliasKeys = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliasKeys) {
    const m = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).exec(q);
    if (m) {
      const span: [number, number] = [m.index, m.index + m[0].length];
      const site = matchDomainByName(ALIASES[alias], knownDomains);
      if (site) return { site, span };
      // Keep looking: "google" alias may be inside "google docs" etc.
      if (alias.length >= 4) return { siteMention: alias, span };
    }
  }

  // 3. Any non-stopword token that resembles a known site name
  const tokenRe = /[a-z0-9][a-z0-9.-]*/g;
  let t: RegExpExecArray | null;
  while ((t = tokenRe.exec(q))) {
    const token = t[0];
    if (token.length < 3 || STOPWORDS.has(token)) continue;
    const site = matchDomainByName(token, knownDomains);
    if (site) return { site, span: [t.index, t.index + token.length] };
  }
  return {};
};

/**
 * Replaces the site and period phrases in a question with fixed placeholders
 * so the embedding classifier sees only the shape of the question.
 * "how long on youtube yesterday" → "how long on this site this week"
 */
export const maskQuestion = (question: string, knownDomains: string[], today: string = getLocalDateStr()): string => {
  const q = question.toLowerCase().trim();
  const spans: Array<[number, number, string]> = findRanges(q, today).map((h) => [h.index, h.index + h.length, 'this week']);
  const site = resolveSite(q, knownDomains);
  if (site.span && !spans.some(([s, e]) => site.span![0] < e && site.span![1] > s)) {
    spans.push([site.span[0], site.span[1], 'this site']);
  }
  spans.sort((a, b) => b[0] - a[0]);
  let out = q;
  for (const [s, e, rep] of spans) out = out.slice(0, s) + rep + out.slice(e);
  return out.replace(/\s+/g, ' ').trim();
};

// ─── Date ranges ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4,
  thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, sixty: 60, ninety: 90, couple: 2, few: 3,
};

interface RangeHit {
  index: number;
  length: number;
  range: DateRange;
}

const num = (s: string): number => (/^\d+$/.test(s) ? Number(s) : WORD_NUMBERS[s] ?? NaN);

const dayOf = (y: number, m: number, d: number, today: string): string | null => {
  const date = new Date(y, m - 1, d);
  if (date.getMonth() !== m - 1) return null; // e.g. Feb 30
  const str = toLocalDateStr(date);
  return str <= today ? str : null;
};

/** Returns "Sep 21"/"21 Sep"/"21/09"/"2026-09-21" style dates as a day range. */
const explicitDate = (text: string, today: string): DateRange | null => {
  const year = Number(today.slice(0, 4));
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { from: text, to: text };
  m = text.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/);
  if (m && MONTHS[m[1]]) {
    const y = m[3] ? Number(m[3]) : year;
    const d = dayOf(y, MONTHS[m[1]], Number(m[2]), today) ?? (m[3] ? null : dayOf(y - 1, MONTHS[m[1]], Number(m[2]), today));
    return d ? { from: d, to: d } : null;
  }
  m = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)\.?(?:,?\s+(\d{4}))?$/);
  if (m && MONTHS[m[2]]) {
    const y = m[3] ? Number(m[3]) : year;
    const d = dayOf(y, MONTHS[m[2]], Number(m[1]), today) ?? (m[3] ? null : dayOf(y - 1, MONTHS[m[2]], Number(m[1]), today));
    return d ? { from: d, to: d } : null;
  }
  m = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    // Assume day/month like most of the world; fall back to month/day if invalid
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
    const d = (b <= 12 && dayOf(y, b, a, today)) || (a <= 12 && dayOf(y, a, b, today)) || null;
    return d ? { from: d, to: d } : null;
  }
  return null;
};

const RANGE_PATTERNS: Array<[RegExp, (m: RegExpMatchArray, today: string) => DateRange | null]> = [
  [/\b(so far )?today\b|\bthis (morning|afternoon|evening)\b|\btonight\b/, () => 'today'],
  [/\byesterday\b/, () => 'yesterday'],
  [/\b(?:in |over |during |for )?the (?:last|past) (\d+|[a-z]+) days?\b|\b(?:last|past|previous) (\d+|[a-z]+) days?\b/, (m, today) => {
    const n = num(m[1] ?? m[2]);
    if (!n) return null;
    if (n === 7) return 'last7';
    if (n === 30) return 'last30';
    if (n === 1) return 'yesterday';
    return { from: addDays(today, -(n - 1)), to: today };
  }],
  [/\b(?:last|past|previous) (\d+|[a-z]+) weeks?\b/, (m, today) => {
    const n = num(m[1]);
    if (!n) return null;
    return n === 1 ? 'last7' : { from: addDays(today, -(n * 7 - 1)), to: today };
  }],
  [/\bthis week\b|\bcurrent week\b|\bweek so far\b/, () => 'thisWeek'],
  [/\blast week\b|\bprevious week\b|\bweek before\b/, () => 'lastWeek'],
  [/\bpast week\b|\bthe last 7 days\b|\bweekly\b|\b(?:a|one|the) week\b|\b7 days\b/, () => 'last7'],
  [/\bthis month\b|\bcurrent month\b|\bmonth so far\b/, () => 'thisMonth'],
  [/\blast month\b|\bprevious month\b/, (_m, today) => {
    const firstOfThis = `${today.slice(0, 7)}-01`;
    const prevEnd = addDays(firstOfThis, -1);
    return { from: `${prevEnd.slice(0, 7)}-01`, to: prevEnd };
  }],
  [/\bpast month\b|\b30 days\b|\bmonthly\b|\b(?:a|one) month\b/, () => 'last30'],
  [/\b(?:all ?time|overall|ever|in total|since (?:the )?(?:beginning|start)|all my data|entire history|lifetime)\b/, () => 'all'],
  [/\b(?:on |last |this )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/, (m, today) => {
    const target = WEEKDAYS[m[1]];
    const dow = parseDateStr(today).getDay();
    let back = (dow - target + 7) % 7;
    if (back === 0 && /\blast /.test(m[0])) back = 7;
    const d = addDays(today, -back);
    return { from: d, to: d };
  }],
  [/\b(?:on |since |from )?(\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/, (m, today) => {
    const d = explicitDate(m[1].trim(), today);
    if (!d) return null;
    // "since Sep 1" → Sep 1..today
    if (/^since /.test(m[0]) && typeof d !== 'string') return { from: d.from, to: today };
    return d;
  }],
];

export const findRanges = (question: string, today: string): RangeHit[] => {
  const q = question.toLowerCase();
  const hits: RangeHit[] = [];
  for (const [re, build] of RANGE_PATTERNS) {
    const global = new RegExp(re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = global.exec(q))) {
      const overlapping = hits.some((h) => m!.index < h.index + h.length && m!.index + m![0].length > h.index);
      if (overlapping) continue;
      const range = build(m, today);
      if (range) hits.push({ index: m.index, length: m[0].length, range });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
};

// ─── Other slots ─────────────────────────────────────────────────────────────

const VISITS_RE = /\b(open(?:ed|s|ing)?|visit(?:ed|s|ing)?|launch(?:ed|es)?|times|tabs?|sessions?|checked|check|frequently|often|frequent|count)\b/;
const TIME_RE = /\b(time|long|hours?|hrs?|minutes?|mins?|spen[dt]|screen ?time|duration|usage)\b/;
const LEAST_RE = /\b(least|lowest|fewest|less|rarely|barely|minimum|min|bottom|smallest|tiniest|shortest|quietest|hardly|seldom|scarcely|never|neglect(?:ed|s|ing)?|ignored?|unused|forgotten|forget|(?:collect|gather)(?:s|ing|ed)? dust)\b/;
const MOST_RE = /\b(most|top|highest|maximum|max|biggest|largest|longest|favou?rite|main|busiest|frequent(?:ly)?|often)\b/;
const COMPARE_RE = /\b(vs\.?|versus|compared?(?: to| with)?|than|difference|more or less|increase[ds]?|decrease[ds]?|up or down|change[ds]?|improv(?:e|ed|ing)|better|worse|trend(?:ing)?)\b/;

export const extractSlots = (
  question: string,
  knownDomains: string[],
  today: string = getLocalDateStr()
): Slots => {
  const q = question.toLowerCase().trim();
  const slots: Slots = { compare: COMPARE_RE.test(q) };

  Object.assign(slots, resolveSite(q, knownDomains));

  const ranges = findRanges(q, today);
  if (ranges[0]) slots.range = ranges[0].range;
  if (ranges[1]) slots.rangeB = ranges[1].range;

  if (VISITS_RE.test(q) && !TIME_RE.test(q)) slots.metric = 'visits';
  else if (TIME_RE.test(q)) slots.metric = 'time';
  else if (VISITS_RE.test(q)) slots.metric = 'visits';

  if (LEAST_RE.test(q)) slots.order = 'least';
  else if (MOST_RE.test(q)) slots.order = 'most';

  const limitMatch = q.match(/\b(?:top|first|bottom|last)\s+(\d+|[a-z]+)\b/) ?? q.match(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:sites?|websites?|apps?|domains?|sessions?|pages?)\b/);
  if (limitMatch) {
    const n = num(limitMatch[1]);
    if (n >= 1 && n <= 20) slots.limit = n;
  }

  return slots;
};
