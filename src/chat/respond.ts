/**
 * respond.ts
 * Turns a QueryResult into a chat answer. Templates only — every number in the
 * text came from stats.ts. `data` lets the UI draw a small bar list.
 */

import type { QueryResult } from './tools';
import { formatDurationShort as fmt, formatDateShort, formatHour } from '../utils/time';

export interface ChatBar {
  label: string;
  value: number;
  display: string;
}

export interface ChatData {
  kind: 'bars';
  title?: string;
  bars: ChatBar[];
}

export interface ChatAnswer {
  text: string;
  data?: ChatData;
  suggestions?: string[];
}

export const SUGGESTIONS = [
  'How much screen time today?',
  'Least used site this week',
  'Average daily time on youtube.com',
  'How many times did I open github.com in the past 7 days?',
  'When do I browse the most?',
  'Compare this week vs last week',
  'Did I stay under my goal this week?',
  'Which day was busiest?',
];

const HELP_TEXT =
  "I answer questions about your browsing from this extension's own data. Try things like the suggestions below, and name a site or a period (today, yesterday, this week, last 7 days, on Monday, since Sep 1).";

const OUT_OF_SCOPE_TEXT =
  "I can only see websites you use in this browser, not desktop apps, other browsers or your phone. Ask me about a site or your overall browser screen time instead.";

/** Deterministic variant picker so answers vary a little but tests stay stable. */
const pick = (variants: string[], seed: string): string => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return variants[h % variants.length];
};

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "today" → "Today", "in the last 7 days" → "In the last 7 days" for sentence starts. */
const RangeStart = (label: string): string => cap(label);

export const respond = (result: QueryResult & { rangeLabel: string; query: { site?: string; siteMention?: string; metric: string; order: string } }): ChatAnswer => {
  const R = result.rangeLabel;
  const seed = JSON.stringify(result.query);

  switch (result.intent) {
    case 'help':
      return { text: HELP_TEXT, suggestions: SUGGESTIONS };

    case 'out_of_scope':
      return { text: OUT_OF_SCOPE_TEXT, suggestions: SUGGESTIONS.slice(0, 3) };

    case 'site_total_time':
    case 'site_avg_time':
    case 'site_visits': {
      const { site, summary, days } = result;
      if (!site) return { text: 'Which site do you mean? Name it like "youtube.com" or just "youtube".', suggestions: SUGGESTIONS.slice(2, 4) };
      if (!summary) {
        return { text: `I haven't recorded any time on ${site} ${R}.` };
      }
      const activeDays = days.filter((d) => d.seconds > 0);
      const data: ChatData | undefined =
        days.length > 1
          ? {
              kind: 'bars',
              title: `${site} · ${result.intent === 'site_visits' ? 'visits' : 'time'} per day`,
              bars: days.map((d) => ({
                label: formatDateShort(d.date),
                value: result.intent === 'site_visits' ? d.visits : d.seconds,
                display: result.intent === 'site_visits' ? String(d.visits) : fmt(d.seconds),
              })),
            }
          : undefined;

      if (result.intent === 'site_visits') {
        const per = summary.activeDays > 1 ? ` That's about ${summary.avgVisitsPerActiveDay} per day you used it.` : '';
        return {
          text: pick(
            [
              `You opened ${site} ${plural(summary.visits, 'time')} ${R}.${per}`,
              `${RangeStart(R)}, ${site} was opened ${plural(summary.visits, 'time')}.${per}`,
            ],
            seed
          ),
          data,
        };
      }
      if (result.intent === 'site_avg_time') {
        if (days.length === 1) {
          return { text: `${RangeStart(R)} you spent ${fmt(summary.totalSeconds)} on ${site}. Ask over a longer period for an average.`, data };
        }
        const peak = summary.peakDay ? ` Your peak was ${fmt(summary.peakDay.seconds)} on ${formatDateShort(summary.peakDay.date)}.` : '';
        return {
          text: pick(
            [
              `${RangeStart(R)} you averaged ${fmt(summary.avgPerDaySeconds)} a day on ${site} (${fmt(summary.avgPerActiveDaySeconds)} on the ${plural(summary.activeDays, 'day')} you used it).${peak}`,
              `On average that's ${fmt(summary.avgPerDaySeconds)} per day on ${site} ${R}, or ${fmt(summary.avgPerActiveDaySeconds)} per active day (${summary.activeDays} of ${summary.daysInRange}).${peak}`,
            ],
            seed
          ),
          data,
        };
      }
      // site_total_time
      const share = summary.shareOfTotal > 0 ? ` That's ${pct(summary.shareOfTotal)} of your browsing ${R}.` : '';
      const spread = activeDays.length > 1 ? ` across ${plural(activeDays.length, 'day')}` : '';
      return {
        text: pick(
          [
            `You spent ${fmt(summary.totalSeconds)} on ${site} ${R}${spread}, over ${plural(summary.visits, 'visit')}.${share}`,
            `${RangeStart(R)}: ${fmt(summary.totalSeconds)} on ${site}${spread} (${plural(summary.visits, 'visit')}).${share}`,
          ],
          seed
        ),
        data,
      };
    }

    case 'most_used':
    case 'least_used': {
      const { sites, totalSites } = result;
      const byVisits = result.query.metric === 'visits';
      if (sites.length === 0) return { text: `No browsing recorded ${R}.` };
      const least = result.intent === 'least_used';
      const show = (s: (typeof sites)[number]) => (byVisits ? plural(s.visits, 'visit') : fmt(s.totalSeconds));
      const top = sites[0];
      const rest = sites.slice(1, 5).map((s) => `${s.site} (${show(s)})`);
      const lead = least
        ? `Your least ${byVisits ? 'opened' : 'used'} site ${R} is ${top.site} with ${show(top)}`
        : `Your most ${byVisits ? 'opened' : 'used'} site ${R} is ${top.site} with ${show(top)}`;
      const tail = rest.length ? `, ${least ? 'then' : 'followed by'} ${rest.join(', ')}.` : '.';
      const note = totalSites > sites.length ? ` (${totalSites} sites in total.)` : '';
      return {
        text: `${lead}${tail}${note}`,
        data: {
          kind: 'bars',
          title: `${least ? 'Least' : 'Most'} ${byVisits ? 'opened' : 'used'} ${R}`,
          bars: sites.map((s) => ({ label: s.site, value: byVisits ? s.visits : s.totalSeconds, display: show(s) })),
        },
      };
    }

    case 'overall_total':
    case 'overall_avg': {
      const s = result.summary;
      if (s.totalSeconds === 0) return { text: `No browsing recorded ${R}.` };
      const top = s.topSite ? ` ${s.topSite.site} took the biggest share (${fmt(s.topSite.totalSeconds)}).` : '';
      if (result.intent === 'overall_avg' && s.daysInRange > 1) {
        const spread = s.busiestDay && s.quietestDay && s.busiestDay.date !== s.quietestDay.date
          ? ` Busiest: ${formatDateShort(s.busiestDay.date)} (${fmt(s.busiestDay.seconds)}); quietest: ${formatDateShort(s.quietestDay.date)} (${fmt(s.quietestDay.seconds)}).`
          : '';
        return {
          text: `${RangeStart(R)} you averaged ${fmt(s.avgPerDaySeconds)} of browser time a day (${fmt(s.avgPerActiveDaySeconds)} on the ${plural(s.activeDays, 'day')} you were active).${spread}${top}`,
        };
      }
      const visitsNote = result.query.metric === 'visits' ? ` You opened sites ${plural(s.visits, 'time')}.` : '';
      const days = s.daysInRange > 1 ? ` across ${plural(s.activeDays, 'active day')} and ${plural(s.siteCount, 'site')}` : ` across ${plural(s.siteCount, 'site')}`;
      return {
        text: pick(
          [
            `${RangeStart(R)} you spent ${fmt(s.totalSeconds)} in the browser${days}.${visitsNote}${top}`,
            `Total browser time ${R}: ${fmt(s.totalSeconds)}${days}.${visitsNote}${top}`,
          ],
          seed
        ),
      };
    }

    case 'daily_breakdown': {
      const { days, site } = result;
      const active = days.filter((d) => d.seconds > 0);
      if (active.length === 0) return { text: `No browsing recorded ${site ? `on ${site} ` : ''}${R}.` };
      const busiest = active.reduce((b, d) => (d.seconds > b.seconds ? d : b));
      const quietest = active.reduce((b, d) => (d.seconds < b.seconds ? d : b));
      const what = site ? `on ${site}` : 'in the browser';
      const text =
        active.length === 1
          ? `${formatDateShort(busiest.date)} is the only day with activity ${what} ${R}: ${fmt(busiest.seconds)}.`
          : `Busiest day ${what} ${R} was ${formatDateShort(busiest.date)} (${fmt(busiest.seconds)}); quietest was ${formatDateShort(quietest.date)} (${fmt(quietest.seconds)}). Here's each day:`;
      return {
        text,
        data: {
          kind: 'bars',
          title: `${site ?? 'All sites'} · per day`,
          bars: days.map((d) => ({ label: formatDateShort(d.date), value: d.seconds, display: fmt(d.seconds) })),
        },
      };
    }

    case 'compare': {
      const c = result.comparison;
      const what = c.site ? `on ${c.site}` : 'in the browser';
      if (c.a.totalSeconds === 0 && c.b.totalSeconds === 0) return { text: `No browsing recorded ${what} ${c.a.label} or ${c.b.label}.` };
      let verdict: string;
      if (c.deltaSeconds === 0) verdict = 'exactly the same';
      else if (c.deltaPercent === null) verdict = `${fmt(Math.abs(c.deltaSeconds))} more (nothing recorded ${c.b.label})`;
      else verdict = `${fmt(Math.abs(c.deltaSeconds))} ${c.deltaSeconds > 0 ? 'more' : 'less'} (${c.deltaSeconds > 0 ? '+' : '-'}${Math.abs(c.deltaPercent)}%)`;
      return {
        text: `${cap(c.a.label)} you spent ${fmt(c.a.totalSeconds)} ${what} vs ${fmt(c.b.totalSeconds)} ${c.b.label}: ${verdict}. Daily average went from ${fmt(c.b.avgPerDaySeconds)} to ${fmt(c.a.avgPerDaySeconds)}.`,
        data: {
          kind: 'bars',
          title: c.site ?? 'All sites',
          bars: [
            { label: cap(c.a.label), value: c.a.totalSeconds, display: fmt(c.a.totalSeconds) },
            { label: cap(c.b.label), value: c.b.totalSeconds, display: fmt(c.b.totalSeconds) },
          ],
        },
      };
    }

    case 'peak_time': {
      const { pattern, site } = result;
      const what = site ? site : 'the browser';
      if (!pattern.hasSessionData || pattern.peakHour === null) {
        return { text: `I don't have time-of-day detail for ${what} ${R} yet — it's collected from now on, so ask again in a day or two.` };
      }
      const total = pattern.hours.reduce((a, b) => a + b, 0);
      const ranked = pattern.hours.map((v, h) => ({ h, v })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
      const top3 = ranked.slice(0, 3).map((x) => `${formatHour(x.h)} (${fmt(x.v)})`);
      const bucket = (h: number) => (h < 6 ? 'late at night' : h < 12 ? 'in the morning' : h < 17 ? 'in the afternoon' : h < 21 ? 'in the evening' : 'at night');
      return {
        text: `You use ${what} most ${bucket(pattern.peakHour)} — the ${formatHour(pattern.peakHour)} hour alone has ${pct(pattern.hours[pattern.peakHour] / total)} of your time ${R}. Top hours: ${top3.join(', ')}.`,
        data: {
          kind: 'bars',
          title: `${what} · by hour`,
          bars: pattern.hours.map((v, h) => ({ label: formatHour(h), value: v, display: fmt(v) })).filter((b) => b.value > 0),
        },
      };
    }

    case 'longest_session': {
      const { sessions, site } = result;
      if (sessions.length === 0) {
        return { text: `No sessions recorded ${site ? `on ${site} ` : ''}${R}. Session detail is collected from now on.` };
      }
      const top = sessions[0];
      const when = new Date(top.startEpochSec * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const rest = sessions.slice(1).map((s) => `${fmt(s.durationSeconds)} on ${s.site} (${formatDateShort(s.date)})`);
      return {
        text: `Your longest single session ${R} was ${fmt(top.durationSeconds)} on ${top.site}, ${formatDateShort(top.date)} starting ${when}.${rest.length ? ` Next: ${rest.join('; ')}.` : ''}`,
      };
    }

    case 'goal': {
      const g = result.status;
      if (g.activeDays === 0) return { text: `No browsing recorded ${R}, so nothing to check against your ${g.goalMinutes}-minute goal.` };
      const goal = fmt(g.goalMinutes * 60);
      const overList = g.daysOver.slice(0, 4).map((d) => `${formatDateShort(d.date)} (${fmt(d.seconds)})`).join(', ');
      const streak = g.currentStreakUnder > 1 ? ` You're on a ${g.currentStreakUnder}-day streak under it.` : '';
      if (g.daysOver.length === 0) {
        return { text: `You stayed under your ${goal} daily goal on all ${plural(g.activeDays, 'active day')} ${R}.${streak}` };
      }
      return {
        text: `${RangeStart(R)} you went over your ${goal} goal on ${g.daysOver.length} of ${plural(g.activeDays, 'active day')}: ${overList}${g.daysOver.length > 4 ? '…' : ''}. You stayed under on ${g.daysUnder.length}.${streak}`,
        data: {
          kind: 'bars',
          title: `Daily total vs ${goal} goal`,
          bars: [...g.daysUnder, ...g.daysOver]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((d) => ({ label: formatDateShort(d.date), value: d.seconds, display: fmt(d.seconds) })),
        },
      };
    }

    case 'list_sites': {
      const { sites } = result;
      if (sites.length === 0) return { text: `No sites recorded ${R}.` };
      const shown = sites.slice(0, 8);
      return {
        text: `${RangeStart(R)} you used ${plural(sites.length, 'site')}${sites.length > 8 ? ' — the top 8' : ''}: ${shown.map((s) => `${s.site} (${fmt(s.totalSeconds)})`).join(', ')}.`,
        data: {
          kind: 'bars',
          title: `Sites ${R}`,
          bars: shown.map((s) => ({ label: s.site, value: s.totalSeconds, display: fmt(s.totalSeconds) })),
        },
      };
    }

    default:
      return { text: HELP_TEXT, suggestions: SUGGESTIONS };
  }
};
