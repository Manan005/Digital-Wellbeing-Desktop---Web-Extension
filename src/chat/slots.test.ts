import { describe, it, expect } from 'vitest';
import { extractSlots, resolveSite, findRanges } from './slots';

const TODAY = '2026-09-27'; // Sunday
const KNOWN = ['youtube.com', 'github.com', 'mail.google.com', 'google.com', 'stackoverflow.com', 'x.com', 'reddit.com', 'chatgpt.com'];

describe('resolveSite', () => {
  it.each([
    ['how long on youtube.com today', 'youtube.com'],
    ['time on youtube', 'youtube.com'],
    ['how many times did I open yt', 'youtube.com'],
    ['average on GitHub this week', 'github.com'],
    ['gmail usage', 'mail.google.com'],
    ['google usage', 'google.com'],
    ['stack overflow time', 'stackoverflow.com'],
    ['how much twitter', 'x.com'],
    ['youtub time', 'youtube.com'], // typo, fuzzy
    ['chatgpt today', 'chatgpt.com'],
    ['www.reddit.com yesterday', 'reddit.com'],
  ])('%s → %s', (q, expected) => {
    expect(resolveSite(q, KNOWN).site).toBe(expected);
  });

  it('reports an unknown site as a mention', () => {
    expect(resolveSite('time on tiktok', KNOWN)).toMatchObject({ siteMention: 'tiktok' });
    expect(resolveSite('time on example.org', KNOWN)).toMatchObject({ siteMention: 'example.org' });
  });

  it('does not match common words to sites', () => {
    expect(resolveSite('what is my total screen time today', KNOWN).site).toBeUndefined();
    expect(resolveSite('least used site this week', KNOWN).site).toBeUndefined();
  });
});

describe('findRanges', () => {
  const first = (q: string) => findRanges(q, TODAY)[0]?.range;

  it.each([
    ['screen time today', 'today'],
    ['so far today', 'today'],
    ['yesterday', 'yesterday'],
    ['in the last 7 days', 'last7'],
    ['past 7 days', 'last7'],
    ['past week', 'last7'],
    ['this week', 'thisWeek'],
    ['last week', 'lastWeek'],
    ['last 30 days', 'last30'],
    ['this month', 'thisMonth'],
    ['all time', 'all'],
    ['overall', 'all'],
  ])('%s → %s', (q, expected) => {
    expect(first(q)).toBe(expected);
  });

  it('builds custom ranges for N days', () => {
    expect(first('last 3 days')).toEqual({ from: '2026-09-25', to: TODAY });
    expect(first('past ten days')).toEqual({ from: '2026-09-18', to: TODAY });
    expect(first('last 2 weeks')).toEqual({ from: '2026-09-14', to: TODAY });
  });

  it('resolves weekday names to the most recent such day', () => {
    expect(first('on monday')).toEqual({ from: '2026-09-21', to: '2026-09-21' });
    expect(first('last sunday')).toEqual({ from: '2026-09-20', to: '2026-09-20' });
  });

  it('parses explicit dates', () => {
    expect(first('on sep 21')).toEqual({ from: '2026-09-21', to: '2026-09-21' });
    expect(first('on 21st september')).toEqual({ from: '2026-09-21', to: '2026-09-21' });
    expect(first('on 2026-09-21')).toEqual({ from: '2026-09-21', to: '2026-09-21' });
    expect(first('since sep 1')).toEqual({ from: '2026-09-01', to: TODAY });
    expect(first('on 21/09')).toEqual({ from: '2026-09-21', to: '2026-09-21' });
  });

  it('resolves last month to a calendar month', () => {
    expect(first('last month')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('finds two ranges for comparisons in order', () => {
    const hits = findRanges('this week vs last week', TODAY);
    expect(hits.map((h) => h.range)).toEqual(['thisWeek', 'lastWeek']);
  });
});

describe('extractSlots', () => {
  it('extracts metric, order and limit', () => {
    const s = extractSlots('top 3 most opened sites this week', KNOWN, TODAY);
    expect(s).toMatchObject({ metric: 'visits', order: 'most', limit: 3, range: 'thisWeek' });
  });

  it('prefers time when both time and open words appear', () => {
    expect(extractSlots('how much time did I spend on open tabs', KNOWN, TODAY).metric).toBe('time');
  });

  it('flags comparisons', () => {
    const s = extractSlots('did I use youtube more than yesterday', KNOWN, TODAY);
    expect(s.compare).toBe(true);
    expect(s.site).toBe('youtube.com');
    expect(s.range).toBe('yesterday');
  });
});
