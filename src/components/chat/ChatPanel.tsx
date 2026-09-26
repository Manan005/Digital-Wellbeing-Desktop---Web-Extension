import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, ArrowUp, Sparkles, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { useChat, type ChatMessage } from '../../chat/useChat';
import type { ChatData } from '../../chat/respond';

// ─── Bar list rendered inside a bot bubble ───────────────────────────────────

const BarList: React.FC<{ data: ChatData }> = ({ data }) => {
  const max = Math.max(...data.bars.map((b) => b.value), 1);
  return (
    <div className="mt-3 space-y-1.5">
      {data.title && (
        <div className="text-[10px] font-bold uppercase tracking-widest text-ink-3 mb-2">{data.title}</div>
      )}
      {data.bars.map((bar) => (
        <div key={bar.label} className="flex items-center gap-2 text-xs">
          <span className="w-24 truncate text-ink-2 font-semibold" title={bar.label}>
            {bar.label}
          </span>
          <div className="flex-1 h-2 rounded-full bg-accent-soft overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${(bar.value / max) * 100}%`, minWidth: bar.value > 0 ? 4 : 0 }}
            />
          </div>
          <span className="w-14 text-right text-ink-2 font-semibold tabular-nums">{bar.display}</span>
        </div>
      ))}
    </div>
  );
};

// ─── One message bubble ──────────────────────────────────────────────────────

const Bubble: React.FC<{ msg: ChatMessage; onSuggestion: (s: string) => void }> = ({ msg, onSuggestion }) => {
  const isUser = msg.role === 'user';
  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')} data-role={msg.role} data-understood-by={msg.understoodBy}>
      <div
        className={clsx(
          'max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser ? 'bg-accent text-ink-inverse rounded-br-md' : 'bg-card border border-line text-ink-2 shadow-sm rounded-bl-md'
        )}
      >
        <p className="whitespace-pre-wrap">{msg.text}</p>
        {msg.data && msg.data.bars.length > 0 && <BarList data={msg.data} />}
        {msg.suggestions && msg.suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {msg.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onSuggestion(s)}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-accent-soft text-accent border border-accent-line hover:bg-accent-line transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Panel ───────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  knownDomains: string[];
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ open, onClose, knownDomains }) => {
  const { messages, busy, status, send, reset } = useChat(knownDomains, open);
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Esc closes the panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const submit = (text: string) => {
    if (busy) return;
    setInput('');
    send(text);
  };

  return (
    <>
      {/* Backdrop (click to close) */}
      <div
        className={clsx('fixed inset-0 z-30 bg-overlay/25 transition-opacity', open ? 'opacity-100' : 'opacity-0 pointer-events-none')}
        onClick={onClose}
      />

      <aside
        className={clsx(
          'fixed top-0 right-0 z-40 h-full w-full sm:w-[420px] bg-canvas border-l border-line shadow-2xl flex flex-col transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.2, 0.64, 1)' }}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-card border-b border-line">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center text-accent">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="font-bold text-ink text-sm">Insights</div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-3" title={status.detail} data-testid="ai-status">
                <span className={clsx('w-1.5 h-1.5 rounded-full', status.provider === 'rules' ? 'bg-ink-4' : 'bg-success')} />
                {status.label}
                {status.downloading !== undefined && ` · ${Math.round(status.downloading * 100)}%`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={reset} className="p-2 rounded-xl text-ink-3 hover:text-accent hover:bg-accent-soft transition-all" title="Clear chat">
              <RotateCcw size={16} />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl text-ink-3 hover:text-ink-2 hover:bg-subtle transition-all" title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3 custom-scrollbar">
          {messages.map((m) => (
            <Bubble key={m.id} msg={m} onSuggestion={submit} />
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-card border border-line shadow-sm rounded-2xl rounded-bl-md px-4 py-3 flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-accent"
                    style={{ animation: 'chatDot 1s ease-in-out infinite', animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="px-4 pb-4 pt-2 bg-card border-t border-line"
        >
          <div className="flex items-center gap-2 bg-canvas border border-line-strong/70 rounded-2xl px-3 py-1.5 focus-within:border-accent/60 transition-all">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your screen time…"
              className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-3 py-1.5"
              maxLength={300}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="w-8 h-8 rounded-xl bg-accent text-ink-inverse flex items-center justify-center disabled:bg-subtle-2 disabled:text-ink-3 hover:bg-accent-hover transition-all"
              title="Send"
            >
              <ArrowUp size={16} />
            </button>
          </div>
          <p className="text-[10px] text-ink-3 text-center mt-2 font-medium">
            Answers are computed on this device from your own data. Nothing is sent anywhere.
          </p>
        </form>

        <style>{`
          @keyframes chatDot {
            0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
            40% { transform: translateY(-3px); opacity: 1; }
          }
        `}</style>
      </aside>
    </>
  );
};

/** Floating launcher shown on the dashboard. */
export const ChatLauncher: React.FC<{ onClick: () => void; hidden?: boolean }> = ({ onClick, hidden }) => (
  <button
    onClick={onClick}
    className={clsx(
      'fixed bottom-6 right-6 z-20 flex items-center gap-2 px-4 py-3 rounded-full bg-accent text-ink-inverse text-sm font-bold shadow-lg shadow-accent/25 hover:bg-accent-hover hover:shadow-xl transition-all',
      hidden && 'opacity-0 pointer-events-none'
    )}
    title="Ask about your usage"
  >
    <MessageCircle size={18} />
    Ask
  </button>
);
