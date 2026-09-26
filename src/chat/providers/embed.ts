/**
 * providers/embed.ts
 * Understander backed by a small sentence-embedding model running on the CPU
 * in a Web Worker. The question is masked (site/period → placeholders),
 * embedded, and matched against precomputed embeddings of example phrasings
 * (src/chat/intent-embeddings.json, built by scripts/build-intent-embeddings.ts).
 * The model picks a coarse label; slots.ts decides site and most/least.
 * Works fully offline after a one-time model download, on any hardware.
 */

import type { Understander, UnderstanderResult, EngineContext } from '../engine';
import { maskQuestion, type Slots } from '../slots';
import { EMBED_LABELS, labelToIntent, type EmbedLabel } from '../intents';
import { classify, decodeIndex, type DecodedIndex, type IntentIndex } from '../knn';
import type { EmbedderInMessage, EmbedderOutMessage } from '../embedder.worker';
import type { ProviderEvents } from './index';

/** How long a question will wait for the model on first use before falling back. */
const FIRST_USE_TIMEOUT_MS = 45_000;
/** Tuned with scripts/build-intent-embeddings.ts: 97% on the held-out set at k=5. */
export const KNN_OPTIONS = { k: 5, minScore: 0.5 };

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      }
    );
  });

/** Where the bundled ONNX runtime lives (extension) or is served from (vite dev). */
const runtimeBase = (): string => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) return chrome.runtime.getURL('ort/');
  return new URL('/node_modules/onnxruntime-web/dist/', location.href).toString();
};

export class EmbedUnderstander implements Understander {
  readonly name = 'embed';
  private worker: Worker | null = null;
  private index: DecodedIndex | null = null;
  private ready: Promise<boolean> | null = null;
  private failed = false;
  private nextId = 1;
  private pending = new Map<number, (v: Float32Array | null) => void>();
  private onReady: ((ok: boolean) => void) | null = null;

  constructor(private readonly events: ProviderEvents) {}

  async isAvailable(): Promise<boolean> {
    return !this.failed && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
  }

  /** Starts loading the model in the background; safe to call repeatedly. */
  warmUp(): Promise<boolean> {
    if (!this.ready) this.ready = this.load();
    return this.ready;
  }

  private async load(): Promise<boolean> {
    try {
      const { default: raw } = await import('../intent-embeddings.json');
      const indexJson = raw as IntentIndex;
      this.index = decodeIndex(indexJson);

      this.events.onStatus({ provider: 'embed', label: 'Setting up', downloading: 0, detail: 'Downloading the on-device model (one time).' });

      const worker = new Worker(new URL('../embedder.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      const ok = await new Promise<boolean>((resolve) => {
        this.onReady = resolve;
        worker.onmessage = (e: MessageEvent<EmbedderOutMessage>) => this.handle(e.data);
        worker.onerror = (e) => {
          console.warn('[chat] embedder worker error', e.message);
          resolve(false);
        };
        const msg: EmbedderInMessage = { type: 'load', model: indexJson.model, dtype: indexJson.dtype, wasmBase: runtimeBase() };
        worker.postMessage(msg);
      });
      this.onReady = null;
      if (!ok) throw new Error('model failed to load');

      this.events.onStatus({ provider: 'embed', label: 'Smart offline', detail: 'On-device sentence model. Nothing leaves this device.' });
      return true;
    } catch (err) {
      console.warn('[chat] embedding classifier unavailable', err);
      this.failed = true;
      this.worker?.terminate();
      this.worker = null;
      this.events.onStatus({ provider: 'rules', label: 'Basic', detail: 'Smart mode could not load; using keyword matching.' });
      return false;
    }
  }

  private handle(msg: EmbedderOutMessage): void {
    switch (msg.type) {
      case 'progress':
        this.events.onStatus({ provider: 'embed', label: 'Setting up', downloading: msg.fraction, detail: 'Downloading the on-device model (one time).' });
        break;
      case 'ready':
        this.onReady?.(true);
        break;
      case 'error':
        console.warn('[chat] embedder error', msg.message);
        if (this.onReady) this.onReady(false);
        // Fail every in-flight embed so questions fall back instead of hanging
        for (const resolve of this.pending.values()) resolve(null);
        this.pending.clear();
        break;
      case 'vector': {
        const resolve = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        resolve?.(msg.vector);
        break;
      }
    }
  }

  private embed(text: string): Promise<Float32Array | null> {
    if (!this.worker) return Promise.resolve(null);
    const id = this.nextId++;
    const msg: EmbedderInMessage = { type: 'embed', id, text };
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker!.postMessage(msg);
    });
  }

  async understand(question: string, slots: Slots, ctx: EngineContext): Promise<UnderstanderResult | null> {
    const ok = await withTimeout(this.warmUp(), FIRST_USE_TIMEOUT_MS, false);
    if (!ok || !this.index) return null;
    const masked = maskQuestion(question, ctx.knownDomains, ctx.today);
    const vector = await withTimeout(this.embed(masked), 15_000, null);
    if (!vector) return null;
    const r = classify(vector, this.index, KNN_OPTIONS);
    if (!r || !(EMBED_LABELS as readonly string[]).includes(r.intent)) return null;
    return { intent: labelToIntent(r.intent as EmbedLabel, slots), confidence: r.confidence };
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }
}
