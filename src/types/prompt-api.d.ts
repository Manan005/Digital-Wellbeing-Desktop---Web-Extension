/**
 * prompt-api.d.ts
 * Minimal typings for Chrome's built-in Prompt API (Gemini Nano).
 * https://developer.chrome.com/docs/ai/prompt-api
 * Only the parts this extension uses are declared.
 */

type LanguageModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LanguageModelDownloadProgressEvent extends Event {
  /** 0..1 */
  loaded: number;
}

interface LanguageModelMonitor extends EventTarget {
  addEventListener(type: 'downloadprogress', listener: (e: LanguageModelDownloadProgressEvent) => void): void;
}

interface LanguageModelExpected {
  type: 'text' | 'image' | 'audio';
  languages?: string[];
}

interface LanguageModelCreateOptions {
  initialPrompts?: LanguageModelMessage[];
  monitor?: (m: LanguageModelMonitor) => void;
  expectedInputs?: LanguageModelExpected[];
  expectedOutputs?: LanguageModelExpected[];
  temperature?: number;
  topK?: number;
  signal?: AbortSignal;
}

interface LanguageModelPromptOptions {
  /** JSON schema the output must conform to. */
  responseConstraint?: object;
  signal?: AbortSignal;
}

interface LanguageModelSession {
  prompt(input: string | LanguageModelMessage[], options?: LanguageModelPromptOptions): Promise<string>;
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
  destroy(): void;
  readonly inputUsage: number;
  readonly inputQuota: number;
}

interface LanguageModelStatic {
  availability(options?: Pick<LanguageModelCreateOptions, 'expectedInputs' | 'expectedOutputs'>): Promise<LanguageModelAvailability>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
  params(): Promise<{ defaultTopK: number; maxTopK: number; defaultTemperature: number; maxTemperature: number } | null>;
}

// Present only in Chrome builds that ship the Prompt API; always feature-detect.
declare const LanguageModel: LanguageModelStatic | undefined;

interface Window {
  LanguageModel?: LanguageModelStatic;
}
