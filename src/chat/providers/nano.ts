/**
 * providers/nano.ts
 * Optional understander backed by Chrome's built-in Gemini Nano (Prompt API).
 * Only used on devices where the model is already available; everything is
 * feature-detected and any failure makes the engine fall through to the next
 * understander. The model classifies the question into a Query — it never
 * computes numbers or writes the answer.
 */

import type { Understander, UnderstanderResult, EngineContext } from '../engine';
import type { Slots } from '../slots';
import { QUERY_JSON_SCHEMA, parseModelQuery } from '../tools';

export type NanoStatus = LanguageModelAvailability | 'unsupported';

const getApi = (): LanguageModelStatic | undefined => {
  if (typeof LanguageModel !== 'undefined' && LanguageModel) return LanguageModel;
  if (typeof window !== 'undefined' && window.LanguageModel) return window.LanguageModel;
  return undefined;
};

/** Current status of the on-device model on this machine. */
export const nanoStatus = async (): Promise<NanoStatus> => {
  const api = getApi();
  if (!api) return 'unsupported';
  try {
    return await api.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }] });
  } catch {
    return 'unsupported';
  }
};

/** Triggers the one-time model download (user-initiated) and reports progress 0..1. */
export const downloadNano = async (onProgress: (fraction: number) => void): Promise<boolean> => {
  const api = getApi();
  if (!api) return false;
  try {
    const session = await api.create({
      monitor: (m) => m.addEventListener('downloadprogress', (e) => onProgress(e.loaded)),
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
    session.destroy();
    return true;
  } catch (err) {
    console.warn('[chat] Nano download failed', err);
    return false;
  }
};

const SYSTEM_PROMPT = `You classify questions about a person's web browsing history into a JSON query. Output only JSON matching the schema.

intent must be one of:
- site_total_time: how much time was spent on one site
- site_avg_time: average time per day on one site
- site_visits: how many times one site was opened/visited
- most_used: which sites take the most time or opens (ranking)
- least_used: which sites take the least time or opens
- overall_total: total browser screen time (all sites)
- overall_avg: average daily browser screen time
- daily_breakdown: per-day totals, busiest/quietest day, trend
- compare: one period vs another (more/less than, up/down, better/worse)
- peak_time: what time of day / hour the person browses most
- longest_session: longest single continuous session
- goal: whether daily goal/limit was met or exceeded
- list_sites: which sites were used
- help: what the assistant can do
- out_of_scope: desktop apps, phone, other browsers, anything not browser sites

Fields: site (the website named, lowercase, e.g. "youtube.com" or "youtube"), range (today, yesterday, last7, last30, thisWeek, lastWeek, thisMonth, all), from/to (YYYY-MM-DD for explicit dates), rangeB (second range when comparing), metric (time or visits), order (most or least), limit (a number like "top 3").
Omit fields the question doesn't mention.`;

const FEW_SHOT: LanguageModelMessage[] = [
  { role: 'user', content: 'Question: how many times did I open youtube in the past 7 days' },
  { role: 'assistant', content: '{"intent":"site_visits","site":"youtube.com","range":"last7","metric":"visits"}' },
  { role: 'user', content: "Question: what's the site I barely touch this month" },
  { role: 'assistant', content: '{"intent":"least_used","range":"thisMonth","order":"least"}' },
  { role: 'user', content: 'Question: am I browsing more than last week?' },
  { role: 'assistant', content: '{"intent":"compare","range":"thisWeek","rangeB":"lastWeek"}' },
  { role: 'user', content: 'Question: roughly how long am I on github each day' },
  { role: 'assistant', content: '{"intent":"site_avg_time","site":"github.com","range":"last7"}' },
  { role: 'user', content: 'Question: when in the day do I doomscroll reddit' },
  { role: 'assistant', content: '{"intent":"peak_time","site":"reddit.com","range":"last7"}' },
];

export class NanoUnderstander implements Understander {
  readonly name = 'nano';
  private base: LanguageModelSession | null = null;
  private baseDomainsKey = '';

  async isAvailable(): Promise<boolean> {
    return (await nanoStatus()) === 'available';
  }

  private async getBase(ctx: EngineContext): Promise<LanguageModelSession | null> {
    const api = getApi();
    if (!api) return null;
    const domains = ctx.knownDomains.slice(0, 40);
    const key = `${ctx.today}|${domains.join(',')}`;
    if (this.base && this.baseDomainsKey === key) return this.base;
    this.base?.destroy();
    this.base = await api.create({
      initialPrompts: [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\nToday is ${ctx.today}. Sites seen recently: ${domains.join(', ') || '(none yet)'}.` },
        ...FEW_SHOT,
      ],
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      temperature: 0,
      topK: 1,
    });
    this.baseDomainsKey = key;
    return this.base;
  }

  async understand(question: string, _slots: Slots, ctx: EngineContext): Promise<UnderstanderResult | null> {
    const base = await this.getBase(ctx);
    if (!base) return null;
    // Clone so each question starts from the same clean context
    const session = typeof base.clone === 'function' ? await base.clone() : base;
    try {
      const raw = await session.prompt(`Question: ${question}`, { responseConstraint: QUERY_JSON_SCHEMA });
      const jsonText = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      const parsed = parseModelQuery(JSON.parse(jsonText));
      if (!parsed?.intent) return null;
      return {
        intent: parsed.intent,
        confidence: 0.75,
        siteMention: parsed.siteMention,
        range: parsed.range,
        rangeB: parsed.rangeB,
      };
    } catch (err) {
      console.warn('[chat] Nano classification failed', err);
      return null;
    } finally {
      if (session !== base) session.destroy();
    }
  }

  dispose(): void {
    this.base?.destroy();
    this.base = null;
  }
}
