/**
 * engine.ts
 * Orchestrates one chat turn: slots → intent (rules, then optional smarter
 * understanders) → query → stats → template answer. Keeps the previous query
 * so short follow-ups ("and last week?", "what about github?") work.
 */

import type { DateRange } from '../utils/stats';
import { loadUsage, knownDomains as domainsOf } from '../utils/stats';
import { getLocalDateStr } from '../utils/storage';
import { extractSlots, resolveSite, type Slots } from './slots';
import { classifyByRules } from './rules';
import { respond, SUGGESTIONS, type ChatAnswer } from './respond';
import { runQuery, defaultRangeFor, counterpartRange, type Intent, type Query, type Loader } from './tools';

export type UnderstoodBy = 'rules' | 'followup' | 'none' | string;

export interface UnderstanderResult {
  intent: Intent;
  confidence: number;
  /** Extra slots the understander is sure about (rarely used; slots.ts wins on conflicts). */
  siteMention?: string;
  range?: DateRange;
  rangeB?: DateRange;
}

/** A smarter classifier (on-device model, embedding classifier, …). */
export interface Understander {
  readonly name: string;
  /** Resolve false to skip this understander on this device. */
  isAvailable(): Promise<boolean>;
  understand(question: string, slots: Slots, ctx: EngineContext): Promise<UnderstanderResult | null>;
}

export interface EngineContext {
  knownDomains: string[];
  today: string;
}

export interface EngineAnswer extends ChatAnswer {
  query?: Query;
  understoodBy: UnderstoodBy;
}

export interface EngineOptions {
  understanders?: Understander[];
  load?: Loader;
  today?: string;
  /** Rule confidence at or above this is accepted without asking a model. */
  ruleThreshold?: number;
  /** Understander confidence needed to accept its intent. */
  modelThreshold?: number;
}

const NOT_UNDERSTOOD =
  "I didn't catch that. Ask about a site, a period, or your screen time — for example:";

const FOLLOWUP_LEAD_RE = /^(and|what about|how about|same for|now|also|then|ok|okay)\b/;

/** A short question that only supplies a site or a period is a follow-up to the previous one. */
const isFollowUp = (question: string, slots: Slots): boolean => {
  if (!slots.site && !slots.range) return false;
  const q = question.toLowerCase().replace(/[?.!,]/g, '').trim();
  return FOLLOWUP_LEAD_RE.test(q) || q.split(/\s+/).length <= 3;
};

export class ChatEngine {
  private lastQuery: Query | null = null;
  private ctx: EngineContext;
  private readonly understanders: Understander[];
  private readonly load: Loader;
  private readonly ruleThreshold: number;
  private readonly modelThreshold: number;

  constructor(knownDomains: string[], opts: EngineOptions = {}) {
    this.ctx = { knownDomains, today: opts.today ?? getLocalDateStr() };
    this.understanders = opts.understanders ?? [];
    this.load = opts.load ?? loadUsage;
    this.ruleThreshold = opts.ruleThreshold ?? 0.8;
    this.modelThreshold = opts.modelThreshold ?? 0.5;
  }

  /** Domains the site matcher knows about; refresh after new browsing. */
  setKnownDomains(domains: string[]): void {
    this.ctx.knownDomains = domains;
  }

  /** Loads every domain seen in the data so site names resolve. */
  static async loadKnownDomains(load: Loader = loadUsage): Promise<string[]> {
    try {
      return domainsOf(await load('all'));
    } catch {
      return [];
    }
  }

  async ask(rawQuestion: string): Promise<EngineAnswer> {
    const question = rawQuestion.trim();
    if (!question) return { text: NOT_UNDERSTOOD, suggestions: SUGGESTIONS, understoodBy: 'none' };

    const slots = extractSlots(question, this.ctx.knownDomains, this.ctx.today);
    const rules = classifyByRules(question, slots);

    let intent: Intent | null = null;
    let understoodBy: UnderstoodBy = 'none';
    let extra: Partial<UnderstanderResult> = {};

    if (rules.confidence >= this.ruleThreshold) {
      intent = rules.intent;
      understoodBy = 'rules';
    } else if (this.lastQuery && isFollowUp(question, slots)) {
      // "and yesterday?", "what about github?": new parameters, same question
      intent = this.lastQuery.intent;
      understoodBy = 'followup';
    } else {
      for (const u of this.understanders) {
        try {
          if (!(await u.isAvailable())) continue;
          const r = await u.understand(question, slots, this.ctx);
          if (r && r.confidence >= this.modelThreshold) {
            intent = r.intent;
            understoodBy = u.name;
            extra = r;
            break;
          }
        } catch (err) {
          console.warn(`[chat] understander ${u.name} failed`, err);
        }
      }
      if (!intent && rules.confidence > 0) {
        intent = rules.intent;
        understoodBy = 'rules';
      }
    }

    if (!intent) {
      return { text: NOT_UNDERSTOOD, suggestions: SUGGESTIONS, understoodBy: 'none' };
    }

    // A model may name a site the rules missed; resolve it the same way
    if (!slots.site && !slots.siteMention && extra.siteMention) {
      Object.assign(slots, resolveSite(extra.siteMention, this.ctx.knownDomains));
      if (!slots.site) slots.siteMention = extra.siteMention;
    }

    const query = this.buildQuery(intent, slots, extra, understoodBy === 'followup');
    this.lastQuery = query;

    try {
      const result = await runQuery(query, this.load);
      return { ...respond(result), query, understoodBy };
    } catch (err) {
      console.error('[chat] query failed', err);
      return { text: 'Something went wrong reading your usage data. Please try again.', query, understoodBy };
    }
  }

  private buildQuery(intent: Intent, slots: Slots, extra: Partial<UnderstanderResult>, isFollowUp: boolean): Query {
    const prev = isFollowUp ? this.lastQuery : null;
    // Site-specific intents need a site; a generic intent with a site becomes site-specific
    let finalIntent = intent;
    const site = slots.site ?? prev?.site;
    const siteMention = slots.site ? undefined : slots.siteMention ?? prev?.siteMention;
    if (site || siteMention) {
      if (finalIntent === 'overall_total') finalIntent = 'site_total_time';
      if (finalIntent === 'overall_avg') finalIntent = 'site_avg_time';
      if (finalIntent === 'most_used' || finalIntent === 'least_used' || finalIntent === 'list_sites') {
        finalIntent = slots.metric === 'visits' ? 'site_visits' : 'site_total_time';
      }
    } else if (finalIntent === 'site_total_time' || finalIntent === 'site_avg_time' || finalIntent === 'site_visits') {
      // Nothing resolved as a site: fall back to the overall version
      finalIntent = finalIntent === 'site_avg_time' ? 'overall_avg' : finalIntent === 'site_visits' ? 'overall_total' : 'overall_total';
    }

    const range: DateRange = slots.range ?? extra.range ?? prev?.range ?? defaultRangeFor(finalIntent);
    let rangeB: DateRange | undefined = slots.rangeB ?? extra.rangeB ?? (isFollowUp ? prev?.rangeB : undefined);
    if (finalIntent === 'compare' && !rangeB) rangeB = counterpartRange(range, this.ctx.today);

    const metric = slots.metric ?? (isFollowUp ? prev?.metric : undefined) ?? 'time';
    const order = slots.order ?? (finalIntent === 'least_used' ? 'least' : 'most');
    const limit = slots.limit ?? (finalIntent === 'longest_session' ? 3 : 5);

    return {
      intent: finalIntent,
      site: site || undefined,
      siteMention: site ? undefined : siteMention,
      range,
      rangeB,
      metric: finalIntent === 'site_visits' ? 'visits' : metric,
      order,
      limit,
    };
  }
}
