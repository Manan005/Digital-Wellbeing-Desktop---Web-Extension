import { describe, it, expect } from 'vitest';
import { sessionKey } from './storage';
import {
  resolveRange,
  datasetFromSnapshot,
  listSites,
  siteSummary,
  rankSites,
  dailyTotals,
  overallSummary,
  compareRanges,
  hourlyPattern,
  longestSessions,
  goalStatus,
} from './stats';

// Fixed "today" so week/month presets are deterministic (a Sunday).
const TODAY = '2026-09-27';

// Local-time epoch for a date string at hh:mm.
const at = (date: string, hh: number, mm = 0): number => {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d, hh, mm).getTime() / 1000);
};

const snapshot: Record<string, unknown> = {
  settings: { dailyGoal: 60 },
  '2026-09-27': {
    'youtube.com': { timeSpentSeconds: 3600, timesOpened: 99 }, // counter ignored: sessions exist
    'github.com': { timeSpentSeconds: 1800, timesOpened: 2 },
    'chrome-extension://abc/index.html': { timeSpentSeconds: 500, timesOpened: 1 },
  },
  [sessionKey('2026-09-27')]: [
    ['youtube.com', at('2026-09-27', 9, 30), 1800],
    ['github.com', at('2026-09-27', 10, 0), 1800],
    ['youtube.com', at('2026-09-27', 21, 45), 1800], // crosses 22:00
  ],
  '2026-09-26': {
    'youtube.com': { timeSpentSeconds: 600, timesOpened: 4 },
    'reddit.com': { timeSpentSeconds: 120, timesOpened: 1 },
  },
  '2026-09-24': {
    'github.com': { timeSpentSeconds: 7200, timesOpened: 3 },
  },
  '2026-09-18': {
    'youtube.com': { timeSpentSeconds: 1000, timesOpened: 5 },
  },
};

const withToday = (range: Parameters<typeof resolveRange>[0]) => {
  const resolved = resolveRange(range, TODAY);
  return datasetFromSnapshot({ from: resolved.from, to: resolved.to }, snapshot);
};

describe('resolveRange', () => {
  it('handles presets relative to today', () => {
    expect(resolveRange('today', TODAY)).toMatchObject({ from: TODAY, to: TODAY });
    expect(resolveRange('yesterday', TODAY)).toMatchObject({ from: '2026-09-26', to: '2026-09-26' });
    expect(resolveRange('last7', TODAY)).toMatchObject({ from: '2026-09-21', to: TODAY });
    expect(resolveRange('last30', TODAY)).toMatchObject({ from: '2026-08-29', to: TODAY });
    expect(resolveRange('thisWeek', TODAY)).toMatchObject({ from: '2026-09-21', to: TODAY });
    expect(resolveRange('lastWeek', TODAY)).toMatchObject({ from: '2026-09-14', to: '2026-09-20' });
    expect(resolveRange('thisMonth', TODAY)).toMatchObject({ from: '2026-09-01', to: TODAY });
  });

  it('orders a reversed custom range', () => {
    expect(resolveRange({ from: '2026-09-10', to: '2026-09-01' })).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-10',
    });
  });
});

describe('listSites / rankSites', () => {
  it('excludes the extension itself and sorts by time', () => {
    const sites = listSites(withToday('last7'));
    expect(sites.map((s) => s.site)).toEqual(['github.com', 'youtube.com', 'reddit.com']);
  });

  it('can keep the extension page for the dashboard view', () => {
    const resolved = resolveRange('today', TODAY);
    const ds = datasetFromSnapshot({ from: resolved.from, to: resolved.to }, snapshot, TODAY, { includeInternal: true });
    expect(listSites(ds).map((s) => s.site)).toContain('chrome-extension://abc/index.html');
  });

  it('uses session counts for visits when a log exists, else timesOpened', () => {
    const yt = listSites(withToday('last7')).find((s) => s.site === 'youtube.com')!;
    // 2 sessions on the 27th + 4 (counter) on the 26th
    expect(yt.visits).toBe(6);
    expect(yt.activeDays).toBe(2);
  });

  it('finds the least used site', () => {
    expect(rankSites(withToday('last7'), { order: 'least', limit: 1 })[0].site).toBe('reddit.com');
  });

  it('ranks by visits', () => {
    const byVisits = rankSites(withToday('last7'), { metric: 'visits' });
    expect(byVisits[0].site).toBe('youtube.com');
  });
});

describe('siteSummary', () => {
  it('computes averages over range days and active days', () => {
    const s = siteSummary(withToday('last7'), 'youtube.com')!;
    expect(s.totalSeconds).toBe(4200);
    expect(s.daysInRange).toBe(7);
    expect(s.avgPerDaySeconds).toBe(600);
    expect(s.avgPerActiveDaySeconds).toBe(2100);
    expect(s.peakDay).toMatchObject({ date: TODAY, seconds: 3600 });
  });

  it('returns null for a site with no data', () => {
    expect(siteSummary(withToday('last7'), 'nope.com')).toBeNull();
  });
});

describe('dailyTotals / overallSummary', () => {
  it('zero-fills days without data', () => {
    const totals = dailyTotals(withToday('last7'));
    expect(totals).toHaveLength(7);
    expect(totals.find((d) => d.date === '2026-09-25')!.seconds).toBe(0);
    expect(totals.find((d) => d.date === TODAY)!.seconds).toBe(5400);
  });

  it('summarises the range', () => {
    const o = overallSummary(withToday('last7'));
    expect(o.totalSeconds).toBe(5400 + 720 + 7200);
    expect(o.activeDays).toBe(3);
    expect(o.busiestDay!.date).toBe('2026-09-24');
    expect(o.quietestDay!.date).toBe('2026-09-26');
    expect(o.topSite!.site).toBe('github.com');
  });
});

describe('compareRanges', () => {
  it('reports delta and percent', () => {
    const c = compareRanges(withToday('thisWeek'), withToday('lastWeek'));
    expect(c.a.totalSeconds).toBe(13320);
    expect(c.b.totalSeconds).toBe(1000);
    expect(c.deltaSeconds).toBe(12320);
    expect(c.deltaPercent).toBe(1232);
  });

  it('returns null percent when the baseline is zero', () => {
    const c = compareRanges(withToday('today'), withToday('yesterday'), 'github.com');
    expect(c.deltaPercent).toBeNull();
  });
});

describe('session-based queries', () => {
  it('splits sessions across hour boundaries', () => {
    const p = hourlyPattern(withToday('today'), 'youtube.com');
    expect(p.hasSessionData).toBe(true);
    expect(p.hours[9]).toBe(1800);
    expect(p.hours[21]).toBe(900);
    expect(p.hours[22]).toBe(900);
    expect(p.peakHour).toBe(9);
  });

  it('reports no session data for days without a log', () => {
    expect(hourlyPattern(withToday('yesterday')).hasSessionData).toBe(false);
  });

  it('lists the longest sessions', () => {
    const top = longestSessions(withToday('last7'), { site: 'github.com', limit: 1 });
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({ site: 'github.com', durationSeconds: 1800 });
  });
});

describe('goalStatus', () => {
  it('splits active days by the daily goal', () => {
    const g = goalStatus(withToday('last7')); // goal 60 min
    expect(g.goalMinutes).toBe(60);
    expect(g.daysOver.map((d) => d.date)).toEqual(['2026-09-24', TODAY]);
    expect(g.daysUnder.map((d) => d.date)).toEqual(['2026-09-26']);
    expect(g.currentStreakUnder).toBe(0);
  });
});
