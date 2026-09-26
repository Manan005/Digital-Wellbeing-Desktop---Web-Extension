/**
 * knn.ts
 * Pure nearest-neighbour intent classifier over precomputed sentence
 * embeddings. Shared by the browser (embed understander) and the Node build
 * script that generates and evaluates the embeddings, so both agree exactly.
 * Must stay free of browser/Node-only APIs and non-erasable TypeScript.
 */

export interface IntentIndex {
  model: string;
  dtype: string;
  dims: number;
  intents: string[];
  /** Index into `intents` for each example. */
  labels: number[];
  texts: string[];
  /** Per-example dequantisation scale. */
  scales: number[];
  /** Base64 of Int8 [examples × dims]. */
  data: string;
}

export interface DecodedIndex {
  intents: string[];
  labels: number[];
  texts: string[];
  dims: number;
  /** Unit-length vectors, one Float32Array per example. */
  vectors: Float32Array[];
}

export interface Classification {
  intent: string;
  /** Best cosine similarity among examples of the winning intent. */
  confidence: number;
  nearest: Array<{ text: string; intent: string; score: number }>;
}

const base64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

export const normalize = (v: Float32Array): Float32Array => {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const inv = sum > 0 ? 1 / Math.sqrt(sum) : 0;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
  return out;
};

/** Cosine similarity of two unit vectors. */
export const dot = (a: Float32Array, b: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** Quantise unit vectors to Int8 with a per-vector scale (≈1% error on cosine). */
export const encodeIndex = (
  meta: Pick<IntentIndex, 'model' | 'dtype' | 'intents'>,
  examples: Array<{ text: string; label: number; vector: Float32Array }>
): IntentIndex => {
  const dims = examples[0]?.vector.length ?? 0;
  const bytes = new Int8Array(examples.length * dims);
  const scales: number[] = [];
  examples.forEach((ex, i) => {
    let max = 0;
    for (let j = 0; j < dims; j++) max = Math.max(max, Math.abs(ex.vector[j]));
    const scale = max > 0 ? max / 127 : 1;
    scales.push(Number(scale.toPrecision(6)));
    for (let j = 0; j < dims; j++) bytes[i * dims + j] = Math.round(ex.vector[j] / scale);
  });
  return {
    ...meta,
    dims,
    labels: examples.map((e) => e.label),
    texts: examples.map((e) => e.text),
    scales,
    data: bytesToBase64(new Uint8Array(bytes.buffer)),
  };
};

export const decodeIndex = (index: IntentIndex): DecodedIndex => {
  const raw = new Int8Array(base64ToBytes(index.data).buffer);
  const vectors: Float32Array[] = [];
  for (let i = 0; i < index.labels.length; i++) {
    const v = new Float32Array(index.dims);
    const scale = index.scales[i];
    for (let j = 0; j < index.dims; j++) v[j] = raw[i * index.dims + j] * scale;
    vectors.push(normalize(v));
  }
  return { intents: index.intents, labels: index.labels, texts: index.texts, dims: index.dims, vectors };
};

export interface ClassifyOptions {
  /** Neighbours that vote. */
  k?: number;
  /** Below this best score the question is "not understood". */
  minScore?: number;
  /** Softmax temperature for vote weights; smaller = the closest match dominates more. */
  temperature?: number;
}

/**
 * Vote among the k nearest examples, weighted by exp((score - best) / T) so a
 * near-exact match is not outvoted by a couple of mediocre neighbours, while
 * genuinely close ties still get decided by majority.
 */
export const classify = (
  query: Float32Array,
  index: DecodedIndex,
  opts: ClassifyOptions = {}
): Classification | null => {
  const { k = 3, minScore = 0.5, temperature = 0.05 } = opts;
  const q = normalize(query);
  const scored = index.vectors.map((v, i) => ({ i, score: dot(q, v) }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, k);
  if (top.length === 0 || top[0].score < minScore) return null;

  const votes = new Map<number, number>();
  const best = new Map<number, number>();
  const topScore = top[0].score;
  for (const { i, score } of top) {
    const label = index.labels[i];
    const weight = Math.exp((score - topScore) / temperature);
    votes.set(label, (votes.get(label) ?? 0) + weight);
    best.set(label, Math.max(best.get(label) ?? 0, score));
  }
  let winner = -1;
  let winnerVotes = -1;
  for (const [label, v] of votes) {
    if (v > winnerVotes) {
      winner = label;
      winnerVotes = v;
    }
  }
  return {
    intent: index.intents[winner],
    confidence: best.get(winner) ?? 0,
    nearest: top.map(({ i, score }) => ({ text: index.texts[i], intent: index.intents[index.labels[i]], score: Number(score.toFixed(3)) })),
  };
};
