/**
 * rules.ts
 * Keyword/regex intent classifier. Instant, tiny, and the first thing the
 * engine tries. Returns an intent with a confidence so the engine knows when
 * to ask a smarter understander instead.
 */

import type { Intent } from './tools';
import type { Slots } from './slots';

export interface IntentGuess {
  intent: Intent;
  /** 1 = unambiguous pattern, ~0.6 = plausible default, 0 = no idea. */
  confidence: number;
}

const HELP_RE = /^(help|hi|hello|hey|what can you do|what can i ask|what do you know|how does this work|\?)\W*$/;
const HELP_LOOSE_RE = /\b(what can (you|i)|what (do|are) you|how (do|can) i (use|ask)|examples?|suggestions?)\b/;
const OUT_OF_SCOPE_RE = /\b(desktop|native|installed|windows apps?|mac apps?|phone|mobile|android|ios|iphone|outside (of )?(the )?browser|other browsers?|firefox|safari|edge browser|vs ?code|spotify app|steam|games?|excel|word doc|whole (computer|pc|laptop|device))\b/;
const GOAL_RE = /\b(goals?|targets?|limits?|budget|exceed(?:ed|s)?|within my|over my|under my|(?:did|have) i (?:meet|met|hit|reach(?:ed)?|stay(?:ed)? (?:under|within)|keep)|on track|streak|day(?:s)? (?:over|under|in a row))\b/;
const PEAK_RE = /\b(when do i|when am i|when i'?m|what time|which (?:hour|time)|time of (?:the )?day|hour(?:s)? of (?:the )?day|by hour|hourly|peak (?:hour|time)|morning|evening|night|afternoon|late at|usually (?:use|browse|on))\b/;
const LONGEST_RE = /\b(longest|single (?:session|sitting|stretch)|in one (?:go|sitting|session)|without (?:a )?break|binge)\b/;
const COMPARE_INTENT_RE = /\b(vs\.?|versus|compared?(?: to| with)?|difference|more or less|increase[ds]?|decrease[ds]?|up or down|change[ds]?|improv(?:e|ed|ing)|better|worse|more than|less than|(?:higher|lower) than)\b/;
const AVG_RE = /\b(avg|average|mean|typical(?:ly)?|usual(?:ly)?|per day|a day|each day|every day|daily|normally|on average)\b/;
const BREAKDOWN_RE = /\b(which day|what day|busiest day|quietest day|day by day|by day|per-day|breakdown|trend|graph|chart|daily (?:usage|totals?|breakdown|numbers))\b/;
const LIST_RE = /\b(what|which|list|show|all)\b[^.?!]*\b(sites?|websites?|apps?|domains?|pages?|tabs?)\b|\bwhat (?:did|have) i (?:use|visit|open|browse)\b|\bshow (?:me )?everything\b/;
const RANK_RE = /\b(top|favou?rite|ranking|rank|biggest|main|which (?:site|website|app|domain)|what (?:site|website|app|domain)|where (?:do|did) i spend)\b/;
const TOTAL_RE = /\b(total|overall|screen ?time|how (?:much|long)|hours?|minutes?|mins?|spen[dt]|usage|online|browsing|browse|used?)\b/;
const VISITS_Q_RE = /\b(how (?:many|often|frequently)|number of|count|times|opens?|opened|visits?|visited|launched|tabs?)\b/;

export const classifyByRules = (question: string, slots: Slots): IntentGuess => {
  const q = question.toLowerCase().trim();
  const hasSite = Boolean(slots.site || slots.siteMention);

  if (HELP_RE.test(q) || (HELP_LOOSE_RE.test(q) && !hasSite)) return { intent: 'help', confidence: 1 };
  if (OUT_OF_SCOPE_RE.test(q) && !hasSite) return { intent: 'out_of_scope', confidence: 0.9 };

  if (GOAL_RE.test(q)) return { intent: 'goal', confidence: 0.9 };
  if (LONGEST_RE.test(q)) return { intent: 'longest_session', confidence: 0.95 };
  if (PEAK_RE.test(q)) return { intent: 'peak_time', confidence: 0.9 };
  if (COMPARE_INTENT_RE.test(q) || (slots.compare && slots.rangeB)) return { intent: 'compare', confidence: 0.9 };

  // "busiest day", "day by day" etc. beat the most/least and average words they contain
  if (BREAKDOWN_RE.test(q)) return { intent: 'daily_breakdown', confidence: 0.9 };

  const wantsAvg = AVG_RE.test(q);
  const wantsVisits = slots.metric === 'visits' && VISITS_Q_RE.test(q);

  if (slots.order === 'least') return { intent: 'least_used', confidence: 0.95 };
  if (slots.order === 'most' && !hasSite) return { intent: 'most_used', confidence: 0.9 };
  if (RANK_RE.test(q) && !hasSite) return { intent: 'most_used', confidence: 0.85 };

  if (hasSite) {
    if (wantsVisits) return { intent: 'site_visits', confidence: 0.95 };
    if (wantsAvg) return { intent: 'site_avg_time', confidence: 0.95 };
    if (TOTAL_RE.test(q)) return { intent: 'site_total_time', confidence: 0.9 };
    if (VISITS_Q_RE.test(q)) return { intent: 'site_visits', confidence: 0.85 };
    // Site named with nothing else: assume they want time on it
    return { intent: 'site_total_time', confidence: 0.6 };
  }

  if (LIST_RE.test(q) && !TOTAL_RE.test(q)) return { intent: 'list_sites', confidence: 0.85 };
  if (wantsAvg) return { intent: 'overall_avg', confidence: 0.9 };
  if (LIST_RE.test(q)) return { intent: 'list_sites', confidence: 0.7 };
  if (TOTAL_RE.test(q) || VISITS_Q_RE.test(q)) return { intent: 'overall_total', confidence: 0.85 };
  if (slots.range) return { intent: 'overall_total', confidence: 0.5 };

  return { intent: 'help', confidence: 0 };
};
