/**
 * useChat.ts
 * React state for the chat panel: owns one ChatEngine, the message list and
 * the AI status pill.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatEngine } from './engine';
import { SUGGESTIONS, type ChatData } from './respond';
import { createProviders, RULES_STATUS, type AiStatus, type ProviderSet } from './providers';

export interface ChatMessage {
  id: number;
  role: 'user' | 'bot';
  text: string;
  data?: ChatData;
  suggestions?: string[];
  understoodBy?: string;
}

const GREETING: ChatMessage = {
  id: 0,
  role: 'bot',
  text: "Hi! Ask me anything about your browsing — how long you've spent on a site, what you open most, when you browse, or how you're doing against your goal.",
  suggestions: SUGGESTIONS.slice(0, 4),
};

let nextId = 1;

export const useChat = (knownDomains: string[], active: boolean) => {
  const engineRef = useRef<ChatEngine | null>(null);
  const providersRef = useRef<ProviderSet | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AiStatus>(RULES_STATUS);

  if (!engineRef.current) {
    providersRef.current = createProviders({ onStatus: setStatus });
    engineRef.current = new ChatEngine(knownDomains, { understanders: providersRef.current.understanders });
  }

  useEffect(() => {
    engineRef.current?.setKnownDomains(knownDomains);
  }, [knownDomains]);

  // First time the panel opens: show the current provider and start the model download
  const warmed = useRef(false);
  useEffect(() => {
    if (!active || warmed.current || !providersRef.current) return;
    warmed.current = true;
    const providers = providersRef.current;
    providers.detectStatus().then(setStatus);
    providers.warmUp();
  }, [active]);

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || !engineRef.current) return;
    setMessages((m) => [...m, { id: nextId++, role: 'user', text: question }]);
    setBusy(true);
    try {
      const answer = await engineRef.current.ask(question);
      setMessages((m) => [
        ...m,
        { id: nextId++, role: 'bot', text: answer.text, data: answer.data, suggestions: answer.suggestions, understoodBy: answer.understoodBy },
      ]);
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => setMessages([GREETING]), []);

  return { messages, busy, status, send, reset };
};
