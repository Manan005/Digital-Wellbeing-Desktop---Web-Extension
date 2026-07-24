import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { LayoutDashboard, ExternalLink, Timer, AlertCircle, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { formatSeconds, getLast7Days } from './utils/time';
import { getFaviconUrl } from './utils/favicon';

// ─── Timer Picker Modal ────────────────────────────────────────────────────────

interface TimerPickerModalProps {
  domain: string | null; // null = global daily goal
  initialMinutes: number;
  onConfirm: (totalMinutes: number) => void;
  onCancel: () => void;
  onDelete?: () => void; // only present when a limit already exists
}

/** A single scrollable drum-roll column (hours or minutes) */
const DrumColumn: React.FC<{
  items: number[];
  selected: number;
  onSelect: (v: number) => void;
  label: string;
}> = ({ items, selected, onSelect, label }) => {
  const ITEM_H = 48; // px per row
  const VISIBLE = 5;  // visible rows; centre one is selected
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startScrollTop = useRef(0);

  // Sync scroll position when `selected` changes externally
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = items.indexOf(selected);
    if (idx === -1) return;
    el.scrollTop = idx * ITEM_H;
  }, [selected, items]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    if (items[clamped] !== selected) {
      onSelect(items[clamped]);
    }
  }, [items, selected, onSelect]);

  // Mouse / touch drag support for desktop
  const onMouseDown = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    isDragging.current = true;
    startY.current = e.clientY;
    startScrollTop.current = el.scrollTop;
    e.preventDefault();
  };
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const dy = startY.current - e.clientY;
    containerRef.current.scrollTop = startScrollTop.current + dy;
  }, []);
  const onMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div className="flex flex-col items-center select-none" style={{ width: 100 }}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onMouseDown={onMouseDown}
        className="overflow-y-scroll relative cursor-grab active:cursor-grabbing"
        style={{
          height: ITEM_H * VISIBLE,
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'y mandatory',
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
              onSelect(val);
              const el = containerRef.current;
              if (el) el.scrollTop = items.indexOf(val) * ITEM_H;
            }}
            style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
            className={clsx(
              'flex items-center justify-center text-lg font-medium transition-all duration-150',
              val === selected ? 'text-slate-900 text-2xl font-bold' : 'text-slate-400'
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
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">{label}</span>
    </div>
  );
};

const HOURS_LIST = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_LIST = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const TimerPickerModal: React.FC<TimerPickerModalProps> = ({ domain, initialMinutes, onConfirm, onCancel, onDelete }) => {
  const initH = Math.floor(initialMinutes / 60);
  const initM = MINUTES_LIST.reduce((prev, cur) =>
    Math.abs(cur - (initialMinutes % 60)) < Math.abs(prev - (initialMinutes % 60)) ? cur : prev, 0);

  const [hours, setHours] = useState(initH);
  const [minutes, setMinutes] = useState(initM);

  const total = hours * 60 + minutes;
  const isGlobal = domain === null;
  const displayName = isGlobal ? 'your daily screen time' : domain!;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-[340px] overflow-hidden"
        style={{ animation: 'timerModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-[18px] font-bold text-slate-900 mb-1">Set app timer</h2>
          <p className="text-sm text-slate-500 leading-snug">
            This app timer for <span className="font-semibold text-slate-700">{displayName}</span> will reset at midnight
          </p>
        </div>

        {/* Drum-roll pickers */}
        {/* items-start keeps the band/colon aligned to the scroll area,
            not the total column height (which includes the label below). */}
        <div className="relative flex justify-center items-start gap-4 py-4 mx-6">
          {/* Selection highlight band — pixel-exact:
              top = py-4(16) + 2 rows(96) = 112px, so band covers rows 2-3 (the centre row). */}
          <div
            className="absolute left-0 right-0 rounded-xl bg-slate-100 pointer-events-none"
            style={{ top: 112, height: 48 }}
          />
          <DrumColumn items={HOURS_LIST}   selected={hours}   onSelect={setHours}   label="hrs" />
          {/* marginTop centres the colon on the band:
              band centre = 112 + 24 = 136px from outer top
              content top = 16px (py-4), so colon top from content = 136 - 16 - 12 = 108px */}
          <span className="text-2xl font-bold text-slate-300 relative z-10" style={{ marginTop: 108 }}>:</span>
          <DrumColumn items={MINUTES_LIST} selected={minutes} onSelect={setMinutes} label="mins" />
        </div>

        {/* Summary */}
        {total > 0 ? (
          <p className="text-center text-xs font-semibold text-indigo-600 pb-1">
            {hours > 0 && `${hours}h `}{minutes > 0 && `${minutes}m`} limit
          </p>
        ) : (
          <p className="text-center text-xs text-rose-500 font-semibold pb-1">No limit will be set</p>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          {/* Delete timer — only shown when a limit already exists */}
          {onDelete ? (
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold text-indigo-500 hover:bg-indigo-50 transition-all"
              title="Delete timer"
            >
              <Trash2 size={15} />
              Delete
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-5 py-2.5 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(total)}
              className="px-5 py-2.5 rounded-2xl text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-all"
            >
              OK
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes timerModalIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

// Type definitions matching the new schema
interface DomainMetrics {
  timeSpentSeconds: number;
  timesOpened: number;
}

interface SiteSettings {
  dailyLimit: number | null; // in seconds
  periodicAlerts: boolean;
}

interface GlobalSettings {
  dailyGoal: number; // in minutes
  periodicAlerts: boolean;
}

// Simple mock chrome object for local browser development
const listeners = new Set<(changes: any) => void>();
if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
  const mockStorage: Record<string, any> = {
    settings: { dailyGoal: 150, periodicAlerts: true },
  };
  
  // Fill in mock data for the last 7 days to make visual testing gorgeous
  const last7DaysList = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    last7DaysList.push(dateStr);
  }
  
  const sampleDomains = ['youtube.com', 'google.com', 'github.com', 'stackoverflow.com', 'facebook.com'];
  last7DaysList.forEach((dateStr, idx) => {
    mockStorage[dateStr] = {};
    sampleDomains.forEach((domain, domIdx) => {
      const seconds = Math.floor((Math.sin(idx + domIdx) + 1) * 3600 * 0.8);
      if (seconds > 0) {
        mockStorage[dateStr][domain] = {
          timeSpentSeconds: seconds,
          timesOpened: Math.floor(seconds / 200) + 1
        };
      }
    });
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

const ActivityDetails: React.FC = () => {
  const [width, setWidth] = useState(window.innerWidth);
  const [allStorage, setAllStorage] = useState<Record<string, any>>({});
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    dailyGoal: 150, // 2h 30m
    periodicAlerts: true,
  });
  const [siteSettings, setSiteSettings] = useState<Record<string, SiteSettings>>({});
  const [timerModal, setTimerModal] = useState<TimerModalState>({ open: false, domain: null, initialMinutes: 0 });

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
      const loadedSettings = {
        dailyGoal: Number(data.settings?.dailyGoal ?? data.dailyGoal ?? 150),
        periodicAlerts: Boolean(data.settings?.periodicAlerts ?? data.periodicAlerts ?? true),
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
    await chrome.storage.local.set({ 
      settings: newSettings,
      [key]: value
    });
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

  // Map 7 days to total seconds active per day
  const dailyTotals = useMemo(() => {
    return last7Days.map((dateStr) => {
      const dayData = allStorage[dateStr] || {};
      let totalSeconds = 0;
      for (const metrics of Object.values(dayData)) {
        totalSeconds += (metrics as DomainMetrics).timeSpentSeconds || 0;
      }
      return {
        dateStr,
        totalSeconds,
        hours: Number((totalSeconds / 3600).toFixed(1)),
      };
    });
  }, [allStorage, last7Days]);

  // Max hours active in the last 7 days (used to scale chart)
  const maxHours = useMemo(() => {
    return Math.max(...dailyTotals.map((d) => d.hours), 1);
  }, [dailyTotals]);

  // Aggregate selected date's metrics (total seconds and sorted list of sites)
  const selectedDateUsage = useMemo(() => {
    const dayData = allStorage[selectedDate] || {};
    let totalSeconds = 0;
    const sitesList: [string, DomainMetrics][] = [];

    for (const [domain, metrics] of Object.entries(dayData)) {
      const sec = (metrics as DomainMetrics).timeSpentSeconds || 0;
      if (sec > 0) {
        totalSeconds += sec;
        sitesList.push([domain, metrics as DomainMetrics]);
      }
    }

    // Sort websites from most-used to least-used
    sitesList.sort((a, b) => b[1].timeSpentSeconds - a[1].timeSpentSeconds);

    return {
      totalSeconds,
      sites: sitesList,
    };
  }, [allStorage, selectedDate]);

  // Today's total screen time in seconds
  const todayTotalSeconds = useMemo(() => {
    const todayData = allStorage[todayStr] || {};
    return Object.values(todayData).reduce(
      (acc: number, curr: any) => acc + ((curr as DomainMetrics).timeSpentSeconds || 0),
      0
    );
  }, [allStorage, todayStr]);

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
      <div className="w-full h-full p-4 bg-[#f6f8ff] text-slate-900 font-sans flex flex-col justify-between overflow-hidden">
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
              <LayoutDashboard className="text-indigo-600" size={22} />
              Wellbeing
            </h1>
            <button
              onClick={openDashboard}
              className="p-2 hover:bg-indigo-50 rounded-xl transition-all border border-slate-200 hover:border-indigo-100 text-slate-500 hover:text-indigo-600"
            >
              <ExternalLink size={16} />
            </button>
          </div>

          {/* Today's usage card */}
          <div className="bg-white rounded-2xl p-4 mb-4 text-center shadow-sm border border-slate-100 flex-shrink-0">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-1 font-semibold">Today's Usage</p>
            <div className="text-4xl font-medium text-slate-800">
              {formatSeconds(todayTotalSeconds)}
            </div>
          </div>

          {/* Top sites list */}
          <div className="flex flex-col flex-1 min-h-0 mb-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1 mb-2 flex-shrink-0">Top Apps</h2>
            <div className="space-y-2 overflow-y-auto pr-1 flex-1 custom-scrollbar">
              {todaySites.map(([domain, metrics]) => (
                <div key={domain} className="flex items-center justify-between bg-white border border-slate-100 p-3 rounded-xl hover:border-slate-200 transition-all shadow-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={getFaviconUrl(domain)}
                      className="w-5 h-5 rounded flex-shrink-0"
                      alt={domain}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                      }}
                    />
                    <span className="font-medium truncate text-sm text-slate-700" title={domain}>{domain}</span>
                  </div>
                  <span className="text-indigo-600 font-semibold text-xs ml-2 flex-shrink-0">
                    {formatSeconds(metrics.timeSpentSeconds)}
                  </span>
                </div>
              ))}
              {todaySites.length === 0 && (
                <p className="text-slate-400 text-center py-6 text-sm">No activity tracked yet today.</p>
              )}
            </div>
          </div>
        </div>

        <footer className="text-center text-[10px] text-slate-400 pt-3 border-t border-slate-100 flex-shrink-0">
          Digital Wellbeing Tracker • Active Screen Time
        </footer>
      </div>
    );
  }

  // ----------------------------------------------------
  // FULL DASHBOARD LAYOUT (width >= 600)
  // ----------------------------------------------------
  return (
    <div className="flex-1 p-8 md:p-12 bg-[#f6f8ff] text-slate-900 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto w-full">
        <header className="flex flex-col items-center mb-10 text-center">
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight mb-4">App activity details</h1>
          
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-600 px-4 py-1.5 rounded-full text-xs font-bold mb-6">
            Screen time <LayoutDashboard size={14} />
          </div>

          <div className="mb-2">
            <span className="text-5xl font-medium text-slate-800">
              {formatSeconds(selectedDateUsage.totalSeconds)}
            </span>
          </div>
          <div className="text-slate-400 text-sm font-semibold tracking-wide uppercase">
            {formatDateFriendly(selectedDate)}
          </div>
        </header>

        {/* 7-Day Custom Bar Graph */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 mb-8">
          {/* Single flex row — each column owns its bar AND its label so they always align */}
          <div className="relative pr-8">
            {/* Y-axis labels — absolutely anchored to the right */}
            <div className="absolute right-0 top-0 bottom-6 flex flex-col justify-between text-[9px] text-slate-400 pointer-events-none text-right font-bold">
              <span>{maxHours.toFixed(1)}h</span>
              <span>{(maxHours / 2).toFixed(1)}h</span>
              <span>0h</span>
            </div>

            {/* Bars + labels unified */}
            <div className="flex items-end justify-between gap-20 border-b border-slate-100">
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
                          isSelected ? "bg-indigo-600" : "bg-indigo-100"
                        )}
                        style={{
                          height: `${heightPercent}%`,
                          minHeight: dayData.totalSeconds > 0 ? '4px' : '0px',
                        }}
                      >
                        {/* Hover Tooltip */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-lg font-bold">
                          {formatSeconds(dayData.totalSeconds)}
                        </div>
                      </div>
                    </div>

                    {/* Day label — directly under this column's bar */}
                    <span
                      className={clsx(
                        "text-[10px] font-bold uppercase tracking-wider pb-1 transition-colors",
                        isSelected ? "text-indigo-600" : "text-slate-400 hover:text-indigo-600"
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
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-600 hover:bg-slate-50 border-slate-200/60"
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
            <h2 className="text-xl font-bold text-slate-800">
              Usage by app ({formatDateFriendly(selectedDate)})
            </h2>
          </div>

          <div className="space-y-2.5">
            {selectedDateUsage.sites.map(([domain, metrics]) => {
              const config = siteSettings[domain] || { dailyLimit: null, periodicAlerts: true };
              
              return (
                <div
                  key={domain}
                  className="flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 border border-slate-100 rounded-2xl transition-all shadow-sm group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#f8f9ff] rounded-2xl flex items-center justify-center border border-slate-100">
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
                      <div className="font-bold text-slate-800 text-base">{domain}</div>
                      <div className="text-xs text-slate-400 mt-0.5 flex gap-3 font-semibold">
                        <span>Time: <strong className="text-slate-600">{formatSeconds(metrics.timeSpentSeconds)}</strong></span>
                        <span>•</span>
                        <span>Opened: <strong className="text-slate-600">{metrics.timesOpened} {metrics.timesOpened === 1 ? 'time' : 'times'}</strong></span>
                      </div>
                    </div>
                  </div>

                   <div className="flex items-center gap-2">
                    {!domain.startsWith('chrome-extension://') && (
                      <button
                        onClick={() => openTimerModal(domain, config.dailyLimit ? Math.round(config.dailyLimit / 60) : 0)}
                        className={clsx(
                          "p-2.5 rounded-xl border transition-all",
                          config.dailyLimit
                            ? "bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100/50"
                            : "border-slate-100 text-slate-400 hover:bg-slate-50"
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
              <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400 font-medium text-sm flex flex-col items-center justify-center gap-2">
                <AlertCircle size={24} className="text-slate-300" />
                No activity tracked for this day.
              </div>
            )}
          </div>
        </div>

        {/* Footer settings block */}
        <div className="mt-12 pt-8 border-t border-slate-200">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Periodic alert switch */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800 text-sm">Periodic Alerts</div>
                <div className="text-[11px] text-slate-400 font-medium mt-0.5">Show notification alert every 5 minutes</div>
              </div>
              <button
                onClick={() => updateGlobalSetting('periodicAlerts', !globalSettings.periodicAlerts)}
                className={clsx(
                  "w-12 h-7 rounded-full transition-all p-1 relative shadow-inner",
                  globalSettings.periodicAlerts ? "bg-indigo-600" : "bg-slate-200"
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
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800 text-sm">Daily Goal Target</div>
                <div className="text-[11px] text-slate-400 font-medium mt-0.5">Set daily overall screen time target</div>
              </div>
              <button
                onClick={() => openTimerModal(null, globalSettings.dailyGoal)}
                className="text-indigo-600 font-extrabold hover:bg-indigo-50 border border-indigo-50 hover:border-indigo-100 px-4 py-1.5 rounded-xl transition-all text-xs"
              >
                {globalSettings.dailyGoal < 60
                  ? `${globalSettings.dailyGoal}m`
                  : `${Math.floor(globalSettings.dailyGoal / 60)}h ${globalSettings.dailyGoal % 60}m`}
              </button>
            </div>
          </div>
        </div>
      </div>

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
