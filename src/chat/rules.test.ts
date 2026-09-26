import { describe, it, expect } from 'vitest';
import { extractSlots } from './slots';
import { classifyByRules } from './rules';
import type { Intent } from './tools';

const TODAY = '2026-09-27';
const KNOWN = ['youtube.com', 'github.com', 'reddit.com', 'google.com'];

const intentOf = (q: string): Intent => classifyByRules(q, extractSlots(q, KNOWN, TODAY)).intent;

describe('classifyByRules', () => {
  const cases: Array<[string, Intent]> = [
    // site time
    ['how much time did I spend on youtube today', 'site_total_time'],
    ['how long was I on github this week', 'site_total_time'],
    ['youtube', 'site_total_time'],
    ['reddit usage yesterday', 'site_total_time'],
    // site average
    ['what is the average screen time on youtube', 'site_avg_time'],
    ['avg daily time on github in the last 7 days', 'site_avg_time'],
    ['how much do I typically spend on reddit per day', 'site_avg_time'],
    // site visits
    ['how many times did I open youtube in the past 7 days', 'site_visits'],
    ['how often do I visit github', 'site_visits'],
    ['number of times reddit was opened this week', 'site_visits'],
    // rankings
    ['what is my most used site', 'most_used'],
    ['top 5 sites this week', 'most_used'],
    ['where do I spend the most time', 'most_used'],
    ['which app do I open the most', 'most_used'],
    ['least used site this week', 'least_used'],
    ["what's the least used app", 'least_used'],
    ['which site do I barely use', 'least_used'],
    ['least opened website', 'least_used'],
    ['which site do I neglect the most', 'least_used'],
    ['what do I almost never open', 'least_used'],
    ['which one gets ignored', 'least_used'],
    // overall
    ['total screen time today', 'overall_total'],
    ['how much time did I spend online this week', 'overall_total'],
    ['how long was I browsing yesterday', 'overall_total'],
    ['how many tabs did I open today', 'overall_total'],
    ['what is my average daily screen time', 'overall_avg'],
    ['on average how many hours a day am I in the browser', 'overall_avg'],
    // breakdown
    ['which day was busiest this week', 'daily_breakdown'],
    ['show me a day by day breakdown', 'daily_breakdown'],
    ['usage trend for the last 30 days', 'daily_breakdown'],
    // compare
    ['compare this week vs last week', 'compare'],
    ['did I use youtube more than yesterday', 'compare'],
    ['is my screen time going up or down', 'compare'],
    ['am I doing better than last week', 'compare'],
    // peak time
    ['when do I browse the most', 'peak_time'],
    ['what time of day do I use youtube', 'peak_time'],
    ['am I on reddit more in the morning or evening', 'peak_time'],
    // longest session
    ['longest session on youtube', 'longest_session'],
    ['what was my longest single sitting this week', 'longest_session'],
    // goal
    ['did I stay under my goal this week', 'goal'],
    ['how many days did I exceed my daily limit', 'goal'],
    ['am I on track with my target', 'goal'],
    // list
    ['what sites did I use today', 'list_sites'],
    ['list all websites I visited yesterday', 'list_sites'],
    // help / scope
    ['help', 'help'],
    ['what can you do', 'help'],
    ['how much did I use spotify app on my desktop', 'out_of_scope'],
    ['how long was I on my phone', 'out_of_scope'],
  ];

  it.each(cases)('%s → %s', (q, expected) => {
    expect(intentOf(q)).toBe(expected);
  });

  it('is unsure about unrelated text', () => {
    expect(classifyByRules('the weather is nice', extractSlots('the weather is nice', KNOWN, TODAY)).confidence).toBe(0);
  });

  it('is only weakly confident when just a site is named', () => {
    const g = classifyByRules('youtube', extractSlots('youtube', KNOWN, TODAY));
    expect(g.confidence).toBeLessThan(0.8);
  });
});
