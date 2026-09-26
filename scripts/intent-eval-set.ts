/**
 * Held-out paraphrases for measuring the embedding classifier. None of these
 * appear in src/chat/intents.ts. Run: node scripts/build-intent-embeddings.ts
 */

export const EVAL_SET: Array<[string, string]> = [
  // site_total_time
  ['how many hours have I sunk into youtube this week', 'site_total_time'],
  ['github time today', 'site_total_time'],
  ['tell me my reddit screen time for yesterday', 'site_total_time'],
  ['total minutes on netflix since monday', 'site_total_time'],
  ['what is my instagram usage looking like', 'site_total_time'],
  // site_avg_time
  ['what do I average per day on youtube', 'site_avg_time'],
  ['my typical daily reddit time', 'site_avg_time'],
  ['how much github on a normal day', 'site_avg_time'],
  ['daily mean for twitter this month', 'site_avg_time'],
  ['per day, how long am I on netflix', 'site_avg_time'],
  // site_visits
  ['how many separate times did I go to youtube today', 'site_visits'],
  ['count my reddit opens this week', 'site_visits'],
  ['number of github visits in the past week', 'site_visits'],
  ['how often did I pop into instagram yesterday', 'site_visits'],
  ['did I check twitter many times today', 'site_visits'],
  // most_used
  ['what eats most of my browsing time', 'most_used'],
  ['my number one site this week', 'most_used'],
  ['which websites are at the top of my usage', 'most_used'],
  ['where does my screen time mostly go', 'most_used'],
  ['what am I on the most', 'most_used'],
  // least_used
  ['which site do I neglect the most', 'least_used'],
  ['what gets the tiniest slice of my time', 'least_used'],
  ['sites at the bottom of my usage', 'least_used'],
  ['which one gets ignored', 'least_used'],
  ['what do I almost never open', 'least_used'],
  // overall_total
  ['how long was I in the browser altogether today', 'overall_total'],
  ['my complete screen time for this week', 'overall_total'],
  ['how much browsing did I do yesterday in total', 'overall_total'],
  ['all my online time this month', 'overall_total'],
  ['how many hours of internet today', 'overall_total'],
  // overall_avg
  ['what does a typical day of screen time look like for me', 'overall_avg'],
  ['my mean browsing time per day', 'overall_avg'],
  ['how much do I browse daily on average', 'overall_avg'],
  ['average of my daily totals this month', 'overall_avg'],
  // daily_breakdown
  ['on which day did I browse the most this week', 'daily_breakdown'],
  ['give me my totals for every day', 'daily_breakdown'],
  ['how is my usage trending over the month', 'daily_breakdown'],
  ['plot my screen time across the week', 'daily_breakdown'],
  ['my slowest day this week', 'daily_breakdown'],
  // compare
  ['is this week heavier than the last one', 'compare'],
  ['am I using youtube less than before', 'compare'],
  ['how do today and yesterday stack up', 'compare'],
  ['has my browsing gone down since last month', 'compare'],
  ['did my reddit time grow this week', 'compare'],
  // peak_time
  ['at what hour am I usually browsing', 'peak_time'],
  ['do I use youtube mostly at night', 'peak_time'],
  ['what part of the day am I most online', 'peak_time'],
  ['when in the day do I hit reddit hardest', 'peak_time'],
  ['my most active hour', 'peak_time'],
  // longest_session
  ['what is the longest I stayed on youtube in one sitting', 'longest_session'],
  ['my biggest uninterrupted browsing stretch this week', 'longest_session'],
  ['longest continuous reddit session', 'longest_session'],
  ['how long was my longest single netflix session', 'longest_session'],
  // goal
  ['did I blow past my daily limit today', 'goal'],
  ['how many days this week did I keep under my goal', 'goal'],
  ['am I sticking to my screen time target', 'goal'],
  ['which days did I go over my allowance', 'goal'],
  ['how long is my streak under the limit', 'goal'],
  // list_sites
  ['what websites did I visit today', 'list_sites'],
  ['name every site I opened this week', 'list_sites'],
  ['which pages have I been on yesterday', 'list_sites'],
  ['show me the list of sites for monday', 'list_sites'],
  // out_of_scope
  ['how much time did I spend in photoshop', 'out_of_scope'],
  ['screen time on my tablet', 'out_of_scope'],
  ['how long did I play minecraft today', 'out_of_scope'],
  ['usage of the slack desktop app', 'out_of_scope'],
];
