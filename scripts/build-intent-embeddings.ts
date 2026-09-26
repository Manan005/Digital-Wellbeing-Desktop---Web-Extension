/**
 * build-intent-embeddings.ts
 * Embeds every example in src/chat/intents.ts with the same model the
 * extension uses at runtime, writes src/chat/intent-embeddings.json, and
 * reports accuracy on the held-out EVAL_SET.
 *
 * Run: npx tsx scripts/build-intent-embeddings.ts
 * Re-run whenever intents.ts, slots.ts masking or the model changes.
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';
import { INTENT_EXAMPLES, EMBED_LABELS, labelToIntent, type EmbedLabel } from '../src/chat/intents';
import { encodeIndex, decodeIndex, classify } from '../src/chat/knn';
import { extractSlots, maskQuestion } from '../src/chat/slots';
import { EVAL_SET } from './intent-eval-set';

export const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const DTYPE = 'q8';

/** Sites named in the examples, so masking works the same as it will live. */
const KNOWN = [
  'youtube.com', 'github.com', 'reddit.com', 'netflix.com', 'instagram.com', 'x.com', 'stackoverflow.com',
  'mail.google.com', 'facebook.com', 'chatgpt.com', 'linkedin.com', 'discord.com', 'google.com',
];
const TODAY = '2026-09-27';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../src/chat/intent-embeddings.json');

env.allowLocalModels = false;

const main = async () => {
  console.log(`Loading ${MODEL} (${DTYPE})…`);
  const embed = await pipeline('feature-extraction', MODEL, { dtype: DTYPE });
  const embedAll = async (texts: string[]): Promise<Float32Array[]> => {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += 32) {
      const batch = texts.slice(i, i + 32);
      const t = await embed(batch, { pooling: 'mean', normalize: true });
      const data = t.data as Float32Array;
      const dims = t.dims[1];
      for (let j = 0; j < batch.length; j++) out.push(data.slice(j * dims, (j + 1) * dims));
    }
    return out;
  };

  const intents = [...EMBED_LABELS];
  const examples: Array<{ text: string; label: number }> = [];
  for (const [label, texts] of Object.entries(INTENT_EXAMPLES)) {
    for (const text of texts) examples.push({ text: maskQuestion(text, KNOWN, TODAY), label: intents.indexOf(label as EmbedLabel) });
  }

  console.log(`Embedding ${examples.length} masked examples across ${intents.length} labels…`);
  const vectors = await embedAll(examples.map((e) => e.text));
  const index = encodeIndex({ model: MODEL, dtype: DTYPE, intents }, examples.map((e, i) => ({ ...e, vector: vectors[i] })));
  writeFileSync(OUT, JSON.stringify(index));
  console.log(`Wrote ${OUT} (${(JSON.stringify(index).length / 1024).toFixed(0)} KB)`);

  // Evaluate on held-out paraphrases exactly as the browser will: mask → embed → kNN → refine with slots
  const decoded = decodeIndex(index);
  const evalVectors = await embedAll(EVAL_SET.map(([q]) => maskQuestion(q, KNOWN, TODAY)));
  for (const k of [1, 3, 5]) {
    let correct = 0;
    let rejected = 0;
    const misses: string[] = [];
    EVAL_SET.forEach(([q, expected], i) => {
      const r = classify(evalVectors[i], decoded, { k, minScore: 0.5 });
      if (!r) {
        rejected++;
        misses.push(`  REJECT  ${q}  (expected ${expected})`);
        return;
      }
      const intent = labelToIntent(r.intent as EmbedLabel, extractSlots(q, KNOWN, TODAY));
      if (intent === expected) correct++;
      else misses.push(`  WRONG   ${q}  → ${intent} @${r.confidence.toFixed(2)} (expected ${expected}; nearest: "${r.nearest[0].text}" [${r.nearest[0].intent}])`);
    });
    const n = EVAL_SET.length;
    console.log(`\nk=${k}: ${correct}/${n} correct (${((correct / n) * 100).toFixed(1)}%), ${rejected} rejected, ${n - correct - rejected} wrong`);
    if (k === 3 && misses.length) console.log(misses.join('\n'));
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
