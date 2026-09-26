import { describe, it, expect, beforeEach } from 'vitest';
import { ChatEngine, type Understander } from './engine';
import { datasetFromSnapshot, type DateRange } from '../utils/stats';
import { sessionKey } from '../utils/storage';

const TODAY = '2026-09-27'; // Sunday

const at = (date: string, hh: number, mm = 0): number => {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d, hh, mm).getTime() / 1000);
};

const snapshot: Record<string, unknown> = {
  settings: { dailyGoal: 60 },
  '2026-09-27': {
    'youtube.com': { timeSpentSeconds: 3600, timesOpened: 99 },
    'github.com': { timeSpentSeconds: 1800, timesOpened: 2 },
  },
  [sessionKey('2026-09-27')]: [
    ['youtube.com', at('2026-09-27', 9, 30), 1800],
    ['github.com', at('2026-09-27', 10, 0), 1800],
    ['youtube.com', at('2026-09-27', 21, 45), 1800],
  ],
  '2026-09-26': {
    'youtube.com': { timeSpentSeconds: 600, timesOpened: 4 },
    'reddit.com': { timeSpentSeconds: 120, timesOpened: 1 },
  },
  '2026-09-24': { 'github.com': { timeSpentSeconds: 7200, timesOpened: 3 } },
  '2026-09-18': { 'youtube.com': { timeSpentSeconds: 1000, timesOpened: 5 } },
};

const load = async (range: DateRange) => datasetFromSnapshot(range, snapshot, TODAY);
const KNOWN = ['youtube.com', 'github.com', 'reddit.com'];

let engine: ChatEngine;
beforeEach(() => {
  engine = new ChatEngine(KNOWN, { load, today: TODAY });
});

describe('ChatEngine end-to-end', () => {
  it('answers a site total', async () => {
    const a = await engine.ask('how much time on youtube today');
    expect(a.understoodBy).toBe('rules');
    expect(a.query).toMatchObject({ intent: 'site_total_time', site: 'youtube.com', range: 'today' });
    expect(a.text).toContain('1h');
    expect(a.text).toContain('youtube.com');
  });

  it('answers visits over 7 days using session counts', async () => {
    const a = await engine.ask('how many times did I open youtube in the past 7 days');
    expect(a.query).toMatchObject({ intent: 'site_visits', range: 'last7' });
    expect(a.text).toContain('6 times');
  });

  it('answers a site average', async () => {
    const a = await engine.ask('average screen time on youtube this week');
    expect(a.query?.intent).toBe('site_avg_time');
    expect(a.text).toMatch(/averaged 10m a day|10m per day/);
  });

  it('finds the least used site', async () => {
    const a = await engine.ask('least used site this week');
    expect(a.query?.intent).toBe('least_used');
    expect(a.text).toContain('reddit.com');
    expect(a.data?.bars[0].label).toBe('reddit.com');
  });

  it('handles follow-ups by reusing the previous intent', async () => {
    await engine.ask('how much time on youtube today');
    const a = await engine.ask('and yesterday?');
    expect(a.understoodBy).toBe('followup');
    expect(a.query).toMatchObject({ intent: 'site_total_time', site: 'youtube.com', range: 'yesterday' });
    expect(a.text).toContain('10m');

    const b = await engine.ask('what about github?');
    expect(b.query).toMatchObject({ intent: 'site_total_time', site: 'github.com', range: 'yesterday' });
  });

  it('compares this week with last week by default', async () => {
    const a = await engine.ask('compare this week vs last week');
    expect(a.query).toMatchObject({ intent: 'compare', range: 'thisWeek', rangeB: 'lastWeek' });
    expect(a.text).toContain('more');
  });

  it('answers time-of-day questions from sessions', async () => {
    const a = await engine.ask('when do I use youtube the most');
    expect(a.query?.intent).toBe('peak_time');
    expect(a.text).toContain('9 AM');
  });

  it('checks the goal', async () => {
    const a = await engine.ask('did I stay under my goal this week');
    expect(a.query?.intent).toBe('goal');
    expect(a.text).toContain('went over');
  });

  it('explains unknown sites', async () => {
    const a = await engine.ask('how long on tiktok today');
    expect(a.text).toContain("haven't recorded any time on tiktok");
  });

  it('declines out-of-scope questions', async () => {
    const a = await engine.ask('how long was I on my phone today');
    expect(a.query?.intent).toBe('out_of_scope');
  });

  it('falls back to suggestions when nothing is understood', async () => {
    const a = await engine.ask('the weather is nice');
    expect(a.understoodBy).toBe('none');
    expect(a.suggestions?.length).toBeGreaterThan(0);
  });

  it('asks an understander only when rules are unsure', async () => {
    const calls: string[] = [];
    const fake: Understander = {
      name: 'fake',
      isAvailable: async () => true,
      understand: async (q) => {
        calls.push(q);
        return { intent: 'least_used', confidence: 0.9 };
      },
    };
    const e = new ChatEngine(KNOWN, { load, today: TODAY, understanders: [fake] });
    await e.ask('least used site this week'); // rules are confident
    expect(calls).toHaveLength(0);
    const a = await e.ask('what is a ghost town for me'); // rules unsure
    expect(calls).toHaveLength(1);
    expect(a.understoodBy).toBe('fake');
    expect(a.query?.intent).toBe('least_used');
  });
});
