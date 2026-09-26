/**
 * providers/index.ts
 * Builds the list of smarter understanders the engine may consult after the
 * rule parser, in priority order, and reports which one is active for the UI.
 */

import type { Understander } from '../engine';
import { NanoUnderstander, nanoStatus } from './nano';
import { EmbedUnderstander } from './embed';

export type AiProvider = 'nano' | 'embed' | 'rules';

export interface AiStatus {
  provider: AiProvider;
  /** Short label for the status pill. */
  label: string;
  /** 0..1 while a model is downloading, otherwise undefined. */
  downloading?: number;
  detail?: string;
}

export interface ProviderEvents {
  onStatus: (status: AiStatus) => void;
}

export const RULES_STATUS: AiStatus = {
  provider: 'rules',
  label: 'Basic',
  detail: 'Keyword matching. Try the suggested questions.',
};

export interface ProviderSet {
  understanders: Understander[];
  /** Begin loading the embedding model in the background (e.g. when the chat opens). */
  warmUp: () => void;
  /** Resolve which provider is active right now, for the status pill. */
  detectStatus: () => Promise<AiStatus>;
}

export const createProviders = (events: ProviderEvents): ProviderSet => {
  const nano = new NanoUnderstander();
  const embed = new EmbedUnderstander(events);
  return {
    understanders: [nano, embed],
    warmUp: () => {
      // Nano needs no warm-up; the embedding model is the one that downloads
      nano.isAvailable().then((ok) => {
        if (!ok) embed.warmUp();
      });
    },
    detectStatus: async () => {
      if ((await nanoStatus()) === 'available') {
        return { provider: 'nano', label: 'On-device AI', detail: "Chrome's built-in model, runs locally." };
      }
      return RULES_STATUS;
    },
  };
};
