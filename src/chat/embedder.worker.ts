/**
 * embedder.worker.ts
 * Web Worker that hosts the sentence-embedding model (transformers.js +
 * ONNX runtime on CPU/WASM) so the dashboard never freezes. Model weights are
 * fetched once from the Hugging Face CDN and cached by the browser; the ONNX
 * runtime itself is bundled with the extension (see vite.config.ts).
 */

/// <reference lib="webworker" />

import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';

export type EmbedderInMessage =
  | { type: 'load'; model: string; dtype: string; wasmBase: string }
  | { type: 'embed'; id: number; text: string };

export type EmbedderOutMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'vector'; id: number; vector: Float32Array };

const post = (msg: EmbedderOutMessage, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(msg, transfer ?? []);

let extractor: FeatureExtractionPipeline | null = null;

interface ProgressInfo {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

const load = async (model: string, dtype: string, wasmBase: string) => {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  // transformers.js would otherwise turn the runtime's JS glue into a blob: URL
  // and import() it, which the extension CSP (script-src 'self') blocks.
  env.useWasmCache = false;
  // Point ORT at the bundled runtime instead of a CDN (Web Store: no remote code)
  const wasm = env.backends.onnx.wasm as Record<string, unknown>;
  wasm.wasmPaths = { wasm: `${wasmBase}ort-wasm-simd-threaded.wasm`, mjs: `${wasmBase}ort-wasm-simd-threaded.mjs` };
  wasm.numThreads = 1; // extension pages aren't cross-origin isolated, so no SharedArrayBuffer
  wasm.proxy = false;

  const files = new Map<string, { loaded: number; total: number }>();
  const report = () => {
    let loaded = 0;
    let total = 0;
    let inFlight = false;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
      if (f.total > 0 && f.loaded < f.total) inFlight = true;
    }
    // Only report while a sized file is still downloading; otherwise the small
    // tokenizer files would briefly read as "90%" before the model file starts.
    // The 'ready' message is the real completion signal.
    if (total > 0 && inFlight) post({ type: 'progress', fraction: Math.min(0.99, loaded / total) });
  };

  extractor = (await pipeline('feature-extraction', model, {
    dtype: dtype as 'q8',
    device: 'wasm',
    progress_callback: (p: ProgressInfo) => {
      if (!p.file) return;
      if (p.status === 'initiate') {
        if (!files.has(p.file)) files.set(p.file, { loaded: 0, total: 0 });
      } else if (p.status === 'progress' && p.total) {
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
        report();
      } else if (p.status === 'done') {
        const f = files.get(p.file);
        if (f && f.total > 0) f.loaded = f.total;
        else files.delete(p.file); // cached file: no size known, nothing to wait for
        report();
      }
    },
  })) as FeatureExtractionPipeline;
};

self.onmessage = async (e: MessageEvent<EmbedderInMessage>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      await load(msg.model, msg.dtype, msg.wasmBase);
      post({ type: 'ready' });
    } else if (msg.type === 'embed') {
      if (!extractor) throw new Error('model not loaded');
      const t = await extractor(msg.text, { pooling: 'mean', normalize: true });
      const vector = new Float32Array(t.data as Float32Array);
      post({ type: 'vector', id: msg.id, vector }, [vector.buffer]);
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
