import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { LayoutDashboard, ExternalLink, Timer, AlertCircle, Trash2, Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { DEFAULT_THEME, isThemeSetting, resolveTheme, toggledSetting, type ThemeSetting } from './utils/theme';
import { applyTheme, cacheThemeSetting, cachedThemeSetting, usePrefersDark } from './utils/themeDom';
import { formatSeconds, getLast7Days } from './utils/time';
import { getFaviconUrl } from './utils/favicon';
import type { GlobalSettings, SiteSettings, SessionTuple } from './utils/storage';
import { sessionKey } from './utils/storage';
import { datasetFromSnapshot, dailyTotals as computeDailyTotals, sitesOnDate, knownDomains as domainsIn } from './utils/stats';
import { ChatPanel, ChatLauncher } from './components/chat/ChatPanel';

// ─── Timer Picker Modal ────────────────────────────────────────────────────────

interface TimerPickerModalProps {
  domain: string | null; // null = global daily goal
  initialMinutes: number;
  onConfirm: (totalMinutes: number) => void;
  onCancel: () => void;
  onDelete?: () => void; // only present when a limit already exists
}

const ITEM_H = 48; // px per drum row
const VISIBLE = 5;  // visible rows; the centre one is selected
const DRUM_H = ITEM_H * VISIBLE;
// Fades the rows at the top and bottom so the wheel reads as curved, and the
// empty rows before "00" look like the edge of the wheel rather than a gap.
const DRUM_FADE = 'linear-gradient(to bottom, transparent 0%, black 32%, black 68%, transparent 100%)';

/** A single scrollable drum-roll column (hours or minutes) */
const DrumColumn: React.FC<{
  items: number[];
  selected: number;
  onSelect: (v: number) => void;
  /** Unit shown inside the selection band, e.g. "hr" */
  unit: string;
}> = ({ items, selected, onSelect, unit }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startScrollTop = useRef(0);
  const lastSelected = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);

  // Sync scroll position when `selected` changes externally
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (selected === lastSelected.current) return;

    lastSelected.current = selected;
    const idx = items.indexOf(selected);
    if (idx === -1) return;

    // Instant position sync, then restore smooth behavior
    el.style.scrollBehavior = 'auto';
    el.scrollTop = idx * ITEM_H;
    
    const frameId = requestAnimationFrame(() => {
      if (el) el.style.scrollBehavior = 'smooth';
    });
    return () => cancelAnimationFrame(frameId);
  }, [selected, items]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    if (items[clamped] !== selected) {
      lastSelected.current = items[clamped];
      onSelect(items[clamped]);
    }
  }, [items, selected, onSelect]);

  // Mouse / touch drag support for desktop
  const onMouseDown = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    el.style.scrollBehavior = 'auto'; // Instant response during mouse drag
    isDragging.current = true;
    startY.current = e.clientY;
    startScrollTop.current = el.scrollTop;
    e.preventDefault();
  };
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const dy = startY.current - e.clientY;
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }
    rafId.current = requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = startScrollTop.current + dy;
      }
    });
  }, []);
  const onMouseUp = useCallback(() => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }
    if (!isDragging.current) return;
    isDragging.current = false;
    const el = containerRef.current;
    if (!el) return;
    
    // Enable smooth snapping transition
    el.style.scrollBehavior = 'smooth';
    const idx = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    el.scrollTop = clamped * ITEM_H;
  }, [items]);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div className="relative select-none" style={{ width: 120, height: DRUM_H }}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onMouseDown={onMouseDown}
        className="h-full w-full overflow-y-scroll cursor-grab active:cursor-grabbing"
        style={{
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'y mandatory',
          scrollBehavior: 'smooth',
          WebkitMaskImage: DRUM_FADE,
          maskImage: DRUM_FADE,
        }}
      >
        {/* top padding phantom rows */}
        {Array.from({ length: Math.floor(VISIBLE / 2) }).map((_, i) => (
          <div key={`top-${i}`} style={{ height: ITEM_H }} />
        ))}
        {items.map((val) => (
          <div
            key={val}
            onClick={() => {
              lastSelected.current = val;
              onSelect(val);
              const el = containerRef.current;
              if (el) {
                el.scrollTo({
                  top: items.indexOf(val) * ITEM_H,
                  behavior: 'smooth'
                });
              }
            }}
            style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
            className={clsx(
              // pr-8 leaves room for the unit label that sits in the band
              'flex items-center justify-center pr-8 tabular-nums transition-all duration-150',
              val === selected ? 'text-ink text-[28px] font-semibold' : 'text-ink-3 text-lg font-medium'
            )}
          >
            {String(val).padStart(2, '0')}
          </div>
        ))}
        {/* bottom padding phantom rows */}
        {Array.from({ length: Math.floor(VISIBLE / 2) }).map((_, i) => (
          <div key={`bot-${i}`} style={{ height: ITEM_H }} />
        ))}
      </div>
      {/* Unit label pinned to the selected row, outside the scrolling area */}
      <span
        className="absolute right-3 flex items-center text-xs font-semibold text-ink-3 pointer-events-none"
        style={{ top: ITEM_H * Math.floor(VISIBLE / 2), height: ITEM_H }}
      >
        {unit}
      </span>
    </div>
  );
};

const HOURS_LIST = Array.from({ length: 24 }, (_, i) => i);
// 1-minute steps so a typed value always has a matching row on the wheel
const MINUTES_LIST = Array.from({ length: 60 }, (_, i) => i);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The extension's own dashboard page shows up in the usage list under a readable name. */
const isInternalPage = (domain: string) => domain.startsWith('chrome-extension://');
const displayNameFor = (domain: string) => (isInternalPage(domain) ? 'Digital Wellbeing (this dashboard)' : domain);

/** "1 hr 15 min", "45 min", "2 hr" */
const formatLimit = (totalMinutes: number): string => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return [h > 0 ? `${h} hr` : '', m > 0 ? `${m} min` : ''].filter(Boolean).join(' ');
};

const SITE_PRESETS = [15, 30, 60, 120];
const GOAL_PRESETS = [60, 120, 180, 240];

const TimerPickerModal: React.FC<TimerPickerModalProps> = ({ domain, initialMinutes, onConfirm, onCancel, onDelete }) => {
  const [hours, setHours] = useState(clamp(Math.floor(initialMinutes / 60), 0, 23));
  const [minutes, setMinutes] = useState(clamp(initialMinutes % 60, 0, 59));

  // Lock background scrolls completely except for the drum columns
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const preventScroll = (e: WheelEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.overflow-y-scroll')) {
        e.preventDefault();
      }
    };

    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('wheel', preventScroll);
      window.removeEventListener('touchmove', preventScroll);
    };
  }, []);

  // Escape closes, like clicking the backdrop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const total = hours * 60 + minutes;
  const isGlobal = domain === null;
  const presets = isGlobal ? GOAL_PRESETS : SITE_PRESETS;
  const applyPreset = (mins: number) => {
    setHours(Math.floor(mins / 60));
    setMinutes(mins % 60);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="timer-modal-title"
        className="timer-modal-card bg-card border border-line rounded-3xl shadow-2xl w-[380px] max-w-full overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-6 pt-6 pb-4">
          <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center flex-shrink-0">
            <Timer size={20} />
          </div>
          <div className="min-w-0">
            <h2 id="timer-modal-title" className="text-[17px] font-bold text-ink leading-tight">
              {isGlobal ? 'Daily screen time goal' : (
                <>Daily limit for <span className="break-all">{domain}</span></>
              )}
            </h2>
            <p className="text-sm text-ink-3 mt-0.5">Resets every day at midnight.</p>
          </div>
        </div>

        {/* Wheel picker in a recessed well */}
        <div className="relative mx-6 rounded-2xl bg-canvas border border-line py-2">
          {/* Selection band behind the centre row of both drums */}
          <div
            className="absolute left-2 right-2 rounded-xl bg-accent-soft border border-accent-line pointer-events-none"
            style={{ top: 8 + ITEM_H * Math.floor(VISIBLE / 2), height: ITEM_H }}
          />
          <div className="relative flex items-center justify-center gap-1">
            <DrumColumn items={HOURS_LIST} selected={hours} onSelect={setHours} unit="hr" />
            <span className="text-2xl font-semibold text-ink-3 pb-1.5" aria-hidden="true">:</span>
            <DrumColumn items={MINUTES_LIST} selected={minutes} onSelect={setMinutes} unit="min" />
          </div>
        </div>

        {/* Quick picks */}
        <div className="flex justify-center gap-2 px-6 pt-3 pb-1">
          {presets.map((mins) => (
            <button
              key={mins}
              type="button"
              onClick={() => applyPreset(mins)}
              aria-pressed={total === mins}
              className={clsx(
                'px-3 py-1 rounded-full text-xs font-semibold border transition-all',
                total === mins
                  ? 'bg-accent-soft text-accent border-accent-line'
                  : 'bg-card text-ink-2 border-line-strong/60 hover:bg-card-hover'
              )}
            >
              {formatLimit(mins)}
            </button>
          ))}
        </div>
        {/* Typed entry, bound to the same state as the wheel */}
        <div className="flex items-center justify-center gap-2 px-6 pt-2 text-xs font-semibold text-ink-3">
          <span>Or type</span>
          <label className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={23}
              value={hours}
              onChange={(e) => setHours(clamp(parseInt(e.target.value, 10) || 0, 0, 23))}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Hours"
              className="w-14 px-2 py-1.5 rounded-lg bg-canvas border border-line-strong/60 text-ink text-sm font-semibold text-center tabular-nums outline-none focus:border-accent/60 transition-all"
            />
            hr
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) => setMinutes(clamp(parseInt(e.target.value, 10) || 0, 0, 59))}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Minutes"
              className="w-14 px-2 py-1.5 rounded-lg bg-canvas border border-line-strong/60 text-ink text-sm font-semibold text-center tabular-nums outline-none focus:border-accent/60 transition-all"
            />
            min
          </label>
        </div>
        <p className="text-center text-xs text-ink-3 px-6 pt-2 pb-3 min-h-[1.25rem]">
          {total === 0 && (onDelete ? 'Pick a duration, or remove the limit.' : 'Pick a duration.')}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-line">
          {onDelete ? (
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-sm font-bold text-danger hover:bg-danger-soft transition-all"
            >
              <Trash2 size={15} />
              Remove
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-2.5 rounded-2xl text-sm font-bold text-ink-2 hover:bg-subtle transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(total)}
              disabled={total === 0}
              className="px-5 py-2.5 rounded-2xl text-sm font-bold whitespace-nowrap bg-accent text-ink-inverse hover:bg-accent-hover disabled:bg-subtle-2 disabled:text-ink-3 transition-all"
            >
              {total > 0 ? `Set ${formatLimit(total)}` : isGlobal ? 'Set goal' : 'Set limit'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes timerModalIn {
          from { opacity: 0; transform: scale(0.9); }
          to   { opacity: 1; transform: scale(1); }
        }
        .timer-modal-card { animation: timerModalIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1); }
        @media (prefers-reduced-motion: reduce) {
          .timer-modal-card { animation: none; }
        }
      `}</style>
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

// Simple mock chrome object for local browser development
const listeners = new Set<(changes: any) => void>();
if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
  const mockStorage: Record<string, any> = {
    settings: { dailyGoal: 150, periodicAlerts: true, theme: 'system' },
  };

  // Fill in mock data for the last 7 days to make visual testing gorgeous
  const last7DaysList = getLast7Days();

  const sampleDomains = ['youtube.com', 'google.com', 'github.com', 'stackoverflow.com', 'facebook.com'];
  last7DaysList.forEach((dateStr, idx) => {
    mockStorage[dateStr] = {};
    const sessions: SessionTuple[] = [];
    const [y, m, d] = dateStr.split('-').map(Number);
    sampleDomains.forEach((domain, domIdx) => {
      const seconds = Math.floor((Math.sin(idx + domIdx) + 1) * 3600 * 0.8);
      if (seconds > 0) {
        const visits = Math.floor(seconds / 200) + 1;
        mockStorage[dateStr][domain] = { timeSpentSeconds: seconds, timesOpened: visits };
        // Spread the day's time over a few sessions at different hours
        const chunks = Math.min(visits, 4);
        for (let c = 0; c < chunks; c++) {
          const hour = 8 + ((domIdx * 3 + c * 4 + idx) % 14);
          sessions.push([domain, Math.floor(new Date(y, m - 1, d, hour, 15).getTime() / 1000), Math.floor(seconds / chunks)]);
        }
      }
    });
    mockStorage[sessionKey(dateStr)] = sessions.sort((a, b) => a[1] - b[1]);
  });

  (window as any).chrome = {
    storage: {
      local: {
        get: async (keys: any) => {
          if (keys === null) return mockStorage;
          if (typeof keys === 'string') return { [keys]: mockStorage[keys] };
          if (Array.isArray(keys)) {
            const res: Record<string, any> = {};
            keys.forEach(k => {
              res[k] = mockStorage[k];
            });
            return res;
          }
          return {};
        },
        set: async (items: Record<string, any>) => {
          Object.assign(mockStorage, items);
          listeners.forEach(cb => cb(items));
        }
      },
      onChanged: {
        addListener: (cb: any) => {
          listeners.add(cb);
        },
        removeListener: (cb: any) => {
          listeners.delete(cb);
        }
      }
    },
    runtime: {
      sendMessage: (msg: any) => {
        console.log('Mock sendMessage:', msg);
      },
      getURL: (path: string) => path
    }
  };
}

// Modal state type
interface TimerModalState {
  open: boolean;
  domain: string | null; // null = global daily goal
  initialMinutes: number;
}

const THEME_OPTIONS: Array<{ value: ThemeSetting; label: string; Icon: LucideIcon }> = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

const ActivityDetails: React.FC = () => {
  const [width, setWidth] = useState(window.innerWidth);
  const [allStorage, setAllStorage] = useState<Record<string, any>>({});
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    dailyGoal: 150, // 2h 30m
    periodicAlerts: true,
    // Seed from the localStorage cache so the first render already matches the saved theme
    theme: cachedThemeSetting() ?? DEFAULT_THEME,
  });
  const [siteSettings, setSiteSettings] = useState<Record<string, SiteSettings>>({});
  const [timerModal, setTimerModal] = useState<TimerModalState>({ open: false, domain: null, initialMinutes: 0 });
  const [chatOpen, setChatOpen] = useState(false);

  // Theme: the setting comes from storage, the OS preference only matters in 'system' mode
  const prefersDark = usePrefersDark();
  const themeSetting = globalSettings.theme ?? DEFAULT_THEME;
  const effectiveTheme = resolveTheme(themeSetting, prefersDark);
  useEffect(() => {
    applyTheme(effectiveTheme);
    cacheThemeSetting(themeSetting);
  }, [effectiveTheme, themeSetting]);

  const openTimerModal = (domain: string | null, initialMinutes: number) => {
    setTimerModal({ open: true, domain, initialMinutes });
  };

  const handleTimerConfirm = async (totalMinutes: number) => {
    setTimerModal({ open: false, domain: null, initialMinutes: 0 });
    if (timerModal.domain === null) {
      // Global daily goal
      if (totalMinutes > 0) {
        await updateGlobalSetting('dailyGoal', totalMinutes);
      }
    } else {
      // Per-site limit
      const limitSecs = totalMinutes > 0 ? totalMinutes * 60 : null;
      await updateSiteLimit(timerModal.domain, limitSecs);
    }
  };

  const handleTimerCancel = () => {
    setTimerModal({ open: false, domain: null, initialMinutes: 0 });
  };

  const handleTimerDelete = async () => {
    const domain = timerModal.domain;
    setTimerModal({ open: false, domain: null, initialMinutes: 0 });
    if (domain !== null) {
      await updateSiteLimit(domain, null);
    }
  };

  // Get date strings for the last 7 calendar days
  const last7Days = useMemo(() => getLast7Days(), []);
  const todayStr = last7Days[last7Days.length - 1];
  const yesterdayStr = last7Days[last7Days.length - 2];

  const [selectedDate, setSelectedDate] = useState(todayStr);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);

    // Fetch storage data initially
    const fetchData = async () => {
      const data = await chrome.storage.local.get(null);
      setAllStorage(data);
      const loadedSettings: GlobalSettings = {
        dailyGoal: Number(data.settings?.dailyGoal ?? data.dailyGoal ?? 150),
        periodicAlerts: Boolean(data.settings?.periodicAlerts ?? data.periodicAlerts ?? true),
        theme: isThemeSetting(data.settings?.theme) ? data.settings.theme : DEFAULT_THEME,
      };
      setGlobalSettings(loadedSettings);
      const siteSettingsMap = data.siteSettings || {};
      setSiteSettings(siteSettingsMap);

      // Auto-open timer modal if 'domain' URL parameter is present
      const searchParams = new URLSearchParams(window.location.search);
      const domainParam = searchParams.get('domain');
      if (domainParam) {
        const domainConfig = siteSettingsMap[domainParam] || { dailyLimit: null, periodicAlerts: true };
        const initialMins = domainConfig.dailyLimit ? Math.round(domainConfig.dailyLimit / 60) : 0;
        setTimerModal({
          open: true,
          domain: domainParam,
          initialMinutes: initialMins
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };
    fetchData();

    // Listen for storage mutations
    const handleStorageChange = () => {
      fetchData();
    };
    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Send periodic tracking heartbeat for the extension dashboard/popup itself when active & visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hasFocus() && document.visibilityState === 'visible') {
        const canonicalUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL('index.html')
          : window.location.href;

        chrome.runtime.sendMessage({
          type: 'HEARTBEAT',
          domain: canonicalUrl
        }).catch(() => {
          // Suppress errors during extension reload
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const updateGlobalSetting = async (key: keyof GlobalSettings, value: any) => {
    const newSettings = { ...globalSettings, [key]: value };
    setGlobalSettings(newSettings);
    // Older code also read dailyGoal/periodicAlerts from the root; keep that copy for them only
    await chrome.storage.local.set(
      key === 'theme' ? { settings: newSettings } : { settings: newSettings, [key]: value }
    );
  };

  const updateSiteLimit = async (domain: string, limitSeconds: number | null) => {
    const currentSiteConfig = siteSettings[domain] || { dailyLimit: null, periodicAlerts: true };
    const newSiteSettings = {
      ...siteSettings,
      [domain]: {
        ...currentSiteConfig,
        dailyLimit: limitSeconds
      }
    };
    setSiteSettings(newSiteSettings);
    await chrome.storage.local.set({ siteSettings: newSiteSettings });
  };

  // Helper to format date string nicely
  const formatDateFriendly = (dateStr: string) => {
    if (dateStr === todayStr) return 'Today';
    if (dateStr === yesterdayStr) return 'Yesterday';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  // Helper to get short day name (e.g. Mon, Tue)
  const getDayName = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  };

  // Last-7-day dataset via the same stats helpers the chatbot uses. The dashboard
  // also lists time spent on this page itself; the chat leaves it out.
  const dataset = useMemo(
    () => datasetFromSnapshot({ from: last7Days[0], to: todayStr }, allStorage, undefined, { includeInternal: true }),
    [allStorage, last7Days, todayStr]
  );

  // Map 7 days to total seconds active per day
  const dailyTotals = useMemo(
    () =>
      computeDailyTotals(dataset).map((d) => ({
        dateStr: d.date,
        totalSeconds: d.seconds,
        hours: Number((d.seconds / 3600).toFixed(1)),
      })),
    [dataset]
  );

  // Max hours active in the last 7 days (used to scale chart)
  const maxHours = useMemo(() => {
    return Math.max(...dailyTotals.map((d) => d.hours), 1);
  }, [dailyTotals]);

  // Aggregate selected date's metrics (total seconds and sorted list of sites)
  const selectedDateUsage = useMemo(() => {
    const sites = sitesOnDate(dataset, selectedDate);
    return {
      totalSeconds: sites.reduce((acc, [, m]) => acc + m.timeSpentSeconds, 0),
      sites,
    };
  }, [dataset, selectedDate]);

  // Today's total screen time in seconds
  const todayTotalSeconds = useMemo(
    () => dailyTotals.find((d) => d.dateStr === todayStr)?.totalSeconds ?? 0,
    [dailyTotals, todayStr]
  );

  // Every domain ever seen, so the chat can resolve site names like "youtube"
  const chatDomains = useMemo(() => domainsIn(datasetFromSnapshot('all', allStorage)), [allStorage]);

  // Open the full extension page dashboard
  const openDashboard = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
  };

  // ----------------------------------------------------
  // COMPACT POPUP LAYOUT (width < 600)
  // ----------------------------------------------------
  if (width < 600) {
    const todaySites = selectedDateUsage.sites;
    return (
      <div className="w-full h-full p-4 bg-canvas text-ink font-sans flex flex-col justify-between overflow-hidden">
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h1 className="text-xl font-bold flex items-center gap-2 text-ink">
              <LayoutDashboard className="text-accent" size={22} />
              Wellbeing
            </h1>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updateGlobalSetting('theme', toggledSetting(effectiveTheme))}
                className="p-2 hover:bg-accent-soft rounded-xl transition-all border border-line-strong hover:border-accent-line text-ink-2 hover:text-accent"
                title={effectiveTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                aria-label={effectiveTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                {effectiveTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                onClick={openDashboard}
                className="p-2 hover:bg-accent-soft rounded-xl transition-all border border-line-strong hover:border-accent-line text-ink-2 hover:text-accent"
                title="Open full dashboard"
              >
                <ExternalLink size={16} />
              </button>
            </div>
          </div>

          {/* Today's usage card */}
          <div className="bg-card rounded-2xl p-4 mb-4 text-center shadow-sm border border-line flex-shrink-0">
            <p className="text-ink-3 text-xs uppercase tracking-wider mb-1 font-semibold">Today's Usage</p>
            <div className="text-4xl font-medium text-ink">
              {formatSeconds(todayTotalSeconds)}
            </div>
          </div>

          {/* Top sites list */}
          <div className="flex flex-col flex-1 min-h-0 mb-4">
            <h2 className="text-xs font-bold text-ink-3 uppercase tracking-widest px-1 mb-2 flex-shrink-0">Top Apps</h2>
            <div className="space-y-2 overflow-y-auto pr-1 flex-1 custom-scrollbar">
              {todaySites.map(([domain, metrics]) => (
                <div key={domain} className="flex items-center justify-between bg-card border border-line p-3 rounded-xl hover:border-line-strong transition-all shadow-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={getFaviconUrl(domain)}
                      className="w-5 h-5 rounded flex-shrink-0 bg-tile"
                      alt={domain}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                      }}
                    />
                    <span className="font-medium truncate text-sm text-ink-2" title={domain}>{displayNameFor(domain)}</span>
                  </div>
                  <span className="text-accent font-semibold text-xs ml-2 flex-shrink-0">
                    {formatSeconds(metrics.timeSpentSeconds)}
                  </span>
                </div>
              ))}
              {todaySites.length === 0 && (
                <p className="text-ink-3 text-center py-6 text-sm">No activity tracked yet today.</p>
              )}
            </div>
          </div>
        </div>

        <footer className="text-center text-[10px] text-ink-3 pt-3 border-t border-line flex-shrink-0">
          Digital Wellbeing Tracker • Active Screen Time
        </footer>
      </div>
    );
  }

  // ----------------------------------------------------
  // FULL DASHBOARD LAYOUT (width >= 600)
  // ----------------------------------------------------
  return (
    // pb-28 keeps the floating Ask button clear of the last settings card
    <div className="flex-1 p-8 md:p-12 pb-28 md:pb-28 bg-canvas text-ink min-h-screen font-sans">
      <div className="max-w-7xl mx-auto w-full">
        <header className="flex flex-col items-center mb-10 text-center">
          <h1 className="text-3xl font-bold text-ink tracking-tight mb-4">App activity details</h1>
          
          <div className="inline-flex items-center gap-2 bg-accent-soft border border-accent-line text-accent px-4 py-1.5 rounded-full text-xs font-bold mb-6">
            Screen time <LayoutDashboard size={14} />
          </div>

          <div className="mb-2">
            <span className="text-5xl font-medium text-ink">
              {formatSeconds(selectedDateUsage.totalSeconds)}
            </span>
          </div>
          <div className="text-ink-3 text-sm font-semibold tracking-wide uppercase">
            {formatDateFriendly(selectedDate)}
          </div>
        </header>

        {/* 7-Day Custom Bar Graph */}
        <div className="bg-card rounded-3xl p-6 md:p-8 shadow-sm border border-line mb-8">
          {/* Single flex row — each column owns its bar AND its label so they always align */}
          <div className="relative pr-8">
            {/* Y-axis labels — absolutely anchored to the right */}
            <div className="absolute right-0 top-0 bottom-6 flex flex-col justify-between text-[9px] text-ink-3 pointer-events-none text-right font-bold">
              <span>{maxHours.toFixed(1)}h</span>
              <span>{(maxHours / 2).toFixed(1)}h</span>
              <span>0h</span>
            </div>

            {/* Bars + labels unified */}
            <div className="flex items-end justify-between gap-20 border-b border-line">
              {dailyTotals.map((dayData) => {
                const isSelected = dayData.dateStr === selectedDate;
                const heightPercent = maxHours > 0 ? (dayData.hours / maxHours) * 100 : 0;

                return (
                  <div
                    key={dayData.dateStr}
                    onClick={() => setSelectedDate(dayData.dateStr)}
                    className="flex-1 flex flex-col items-center cursor-pointer group px-1"
                  >
                    {/* Bar area — fixed height so all bars scale uniformly */}
                    <div className="w-full flex flex-col items-center justify-end h-56 pb-2">
                      <div
                        className={clsx(
                          "w-full transition-all rounded-t-lg relative hover:opacity-90",
                          isSelected ? "bg-accent" : "bg-accent-idle"
                        )}
                        style={{
                          height: `${heightPercent}%`,
                          minHeight: dayData.totalSeconds > 0 ? '4px' : '0px',
                        }}
                      >
                        {/* Hover Tooltip */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-tooltip text-ink-inverse text-[10px] px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-lg font-bold">
                          {formatSeconds(dayData.totalSeconds)}
                        </div>
                      </div>
                    </div>

                    {/* Day label — directly under this column's bar */}
                    <span
                      className={clsx(
                        "text-[10px] font-bold uppercase tracking-wider pb-1 transition-colors",
                        isSelected ? "text-accent" : "text-ink-3 hover:text-accent"
                      )}
                    >
                      {getDayName(dayData.dateStr)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected Date Navigation Pills */}
        <div className="flex justify-center gap-2 mb-8 overflow-x-auto py-1">
          {dailyTotals.map((dayData) => {
            const isSelected = dayData.dateStr === selectedDate;
            let label = formatDateFriendly(dayData.dateStr);
            if (dayData.dateStr !== todayStr && dayData.dateStr !== yesterdayStr) {
              const [year, month, day] = dayData.dateStr.split('-').map(Number);
              const date = new Date(year, month - 1, day);
              label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            }
            return (
              <button
                key={dayData.dateStr}
                onClick={() => setSelectedDate(dayData.dateStr)}
                className={clsx(
                  "px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm border whitespace-nowrap",
                  isSelected
                    ? "bg-accent text-ink-inverse border-accent"
                    : "bg-card text-ink-2 hover:bg-card-hover border-line-strong/60"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Website Breakdown Listing */}
        <div className="space-y-5">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-bold text-ink">
              Usage by app ({formatDateFriendly(selectedDate)})
            </h2>
          </div>

          <div className="space-y-2.5">
            {selectedDateUsage.sites.map(([domain, metrics]) => {
              const config = siteSettings[domain] || { dailyLimit: null, periodicAlerts: true };
              
              return (
                <div
                  key={domain}
                  className="flex items-center justify-between p-4 bg-card hover:bg-card-hover border border-line rounded-2xl transition-all shadow-sm group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-tile rounded-2xl flex items-center justify-center border border-line">
                      <img
                        src={getFaviconUrl(domain)}
                        className="w-8 h-8 rounded-md"
                        alt={domain}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                        }}
                      />
                    </div>
                    <div>
                      <div className="font-bold text-ink text-base" title={domain}>{displayNameFor(domain)}</div>
                      <div className="text-xs text-ink-3 mt-0.5 flex gap-3 font-semibold">
                        <span>Time: <strong className="text-ink-2">{formatSeconds(metrics.timeSpentSeconds)}</strong></span>
                        <span>•</span>
                        <span>Opened: <strong className="text-ink-2">{metrics.timesOpened} {metrics.timesOpened === 1 ? 'time' : 'times'}</strong></span>
                      </div>
                    </div>
                  </div>

                   <div className="flex items-center gap-2">
                    {!isInternalPage(domain) && (
                      <button
                        onClick={() => openTimerModal(domain, config.dailyLimit ? Math.round(config.dailyLimit / 60) : 0)}
                        className={clsx(
                          "p-2.5 rounded-xl border transition-all",
                          config.dailyLimit
                            ? "bg-danger-soft border-danger-line text-danger hover:bg-danger-line/50"
                            : "border-line text-ink-3 hover:bg-card-hover"
                        )}
                        title="Set App Limit"
                      >
                        <Timer size={20} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {selectedDateUsage.sites.length === 0 && (
              <div className="text-center py-12 bg-card rounded-2xl border border-dashed border-line-strong text-ink-3 font-medium text-sm flex flex-col items-center justify-center gap-2">
                <AlertCircle size={24} className="text-ink-4" />
                No activity tracked for this day.
              </div>
            )}
          </div>
        </div>

        {/* Footer settings block */}
        <div className="mt-12 pt-8 border-t border-line-strong">
          <h3 className="text-xs font-bold text-ink-3 uppercase tracking-widest mb-6">Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Periodic alert switch */}
            <div className="bg-card p-5 rounded-2xl border border-line shadow-sm flex items-center justify-between">
              <div>
                <div className="font-bold text-ink text-sm">Periodic Alerts</div>
                <div className="text-[11px] text-ink-3 font-medium mt-0.5">Show notification alert every 5 minutes</div>
              </div>
              <button
                onClick={() => updateGlobalSetting('periodicAlerts', !globalSettings.periodicAlerts)}
                className={clsx(
                  "w-12 h-7 rounded-full transition-all p-1 relative shadow-inner",
                  globalSettings.periodicAlerts ? "bg-accent" : "bg-subtle-2"
                )}
              >
                <div
                  className={clsx(
                    "w-5 h-5 bg-white rounded-full shadow-sm transition-all",
                    globalSettings.periodicAlerts ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Daily screen time target goal setter */}
            <div className="bg-card p-5 rounded-2xl border border-line shadow-sm flex items-center justify-between">
              <div>
                <div className="font-bold text-ink text-sm">Daily Goal Target</div>
                <div className="text-[11px] text-ink-3 font-medium mt-0.5">Set daily overall screen time target</div>
              </div>
              <button
                onClick={() => openTimerModal(null, globalSettings.dailyGoal)}
                className="text-accent font-extrabold hover:bg-accent-soft border border-accent-soft hover:border-accent-line px-4 py-1.5 rounded-xl transition-all text-xs"
              >
                {globalSettings.dailyGoal < 60
                  ? `${globalSettings.dailyGoal}m`
                  : `${Math.floor(globalSettings.dailyGoal / 60)}h ${globalSettings.dailyGoal % 60}m`}
              </button>
            </div>

            {/* Theme picker */}
            <div className="bg-card p-5 rounded-2xl border border-line shadow-sm flex items-center justify-between gap-4 md:col-span-2">
              <div>
                <div className="font-bold text-ink text-sm">Appearance</div>
                <div className="text-[11px] text-ink-3 font-medium mt-0.5">Follow your system or pick a theme</div>
              </div>
              <div role="group" aria-label="Theme" className="flex gap-1">
                {THEME_OPTIONS.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={themeSetting === value}
                    onClick={() => updateGlobalSetting('theme', value)}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all",
                      themeSetting === value
                        ? "bg-accent text-ink-inverse border-accent"
                        : "bg-card text-ink-2 border-line-strong/60 hover:bg-card-hover"
                    )}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Usage insights chat */}
      <ChatLauncher onClick={() => setChatOpen(true)} hidden={chatOpen || timerModal.open} />
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} knownDomains={chatDomains} />

      {/* Timer Picker Modal */}
      {timerModal.open && (
        <TimerPickerModal
          domain={timerModal.domain}
          initialMinutes={timerModal.initialMinutes}
          onConfirm={handleTimerConfirm}
          onCancel={handleTimerCancel}
          onDelete={
            timerModal.domain !== null && (timerModal.initialMinutes > 0 || Boolean(siteSettings[timerModal.domain]?.dailyLimit))
              ? handleTimerDelete
              : undefined
          }
        />
      )}
    </div>
  );
};

export default ActivityDetails;
