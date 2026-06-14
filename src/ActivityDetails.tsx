import React, { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, ExternalLink, Timer, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { formatSeconds, getLast7Days } from './utils/time';

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

const ActivityDetails: React.FC = () => {
  const [width, setWidth] = useState(window.innerWidth);
  const [allStorage, setAllStorage] = useState<Record<string, any>>({});
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    dailyGoal: 150, // 2h 30m
    periodicAlerts: true,
  });
  const [siteSettings, setSiteSettings] = useState<Record<string, SiteSettings>>({});

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
      if (data.siteSettings) {
        setSiteSettings(data.siteSettings);
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
    const todaySites = selectedDateUsage.sites.slice(0, 3);
    return (
      <div className="w-full p-4 bg-gray-950 text-slate-100 font-sans min-h-[480px] flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-xl font-bold flex items-center gap-2 text-white">
              <LayoutDashboard className="text-indigo-400" size={22} />
              Wellbeing
            </h1>
            <button
              onClick={openDashboard}
              className="p-2 hover:bg-gray-800 rounded-xl transition-all border border-gray-800 hover:border-gray-700"
            >
              <ExternalLink size={16} />
            </button>
          </div>

          <div className="bg-gray-900/60 rounded-2xl p-5 mb-5 text-center shadow-md border border-gray-800/80">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1 font-semibold">Today's Usage</p>
            <div className="text-4xl font-extrabold text-indigo-400">
              {formatSeconds(todayTotalSeconds)}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Top Apps</h2>
            {todaySites.map(([domain, metrics]) => (
              <div key={domain} className="flex items-center justify-between bg-gray-900/40 border border-gray-900 p-3 rounded-xl hover:border-gray-800 transition-all">
                <span className="font-medium truncate max-w-[170px] text-sm text-slate-200">{domain}</span>
                <span className="text-indigo-300 font-mono text-xs font-semibold">
                  {formatSeconds(metrics.timeSpentSeconds)}
                </span>
              </div>
            ))}
            {todaySites.length === 0 && (
              <p className="text-gray-500 text-center py-6 text-sm">No activity tracked yet today.</p>
            )}
          </div>
        </div>

        <footer className="text-center text-[10px] text-slate-500 pt-4 border-t border-gray-900">
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
          <div className="flex items-end justify-between gap-4 h-44 mb-4 border-b border-slate-100 pb-2 relative">
            {dailyTotals.map((dayData) => {
              const isSelected = dayData.dateStr === selectedDate;
              const heightPercent = maxHours > 0 ? (dayData.hours / maxHours) * 100 : 0;
              const totalMins = Math.floor(dayData.totalSeconds / 60);

              return (
                <div
                  key={dayData.dateStr}
                  onClick={() => setSelectedDate(dayData.dateStr)}
                  className="flex-1 flex flex-col items-center group h-full justify-end cursor-pointer"
                >
                  <div
                    className={clsx(
                      "w-full max-w-[56px] transition-all rounded-t-lg relative hover:opacity-90 shadow-sm",
                      isSelected ? "bg-indigo-600" : "bg-indigo-100"
                    )}
                    style={{
                      height: `${heightPercent}%`,
                      minHeight: dayData.totalSeconds > 0 ? '4px' : '0px',
                    }}
                  >
                    {/* Hover Tooltip showing formatted duration */}
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-15 shadow-lg font-bold">
                      {formatSeconds(dayData.totalSeconds)}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Axis Labels */}
            <div className="absolute right-0 top-0 bottom-2 flex flex-col justify-between text-[9px] text-slate-400 pointer-events-none text-right pr-1 font-bold">
              <span>{maxHours.toFixed(1)}h</span>
              <span>{(maxHours / 2).toFixed(1)}h</span>
              <span>0h</span>
            </div>
          </div>
          
          <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider px-1">
            {dailyTotals.map((dayData) => {
              const isSelected = dayData.dateStr === selectedDate;
              return (
                <span
                  key={dayData.dateStr}
                  onClick={() => setSelectedDate(dayData.dateStr)}
                  className={clsx(
                    "cursor-pointer hover:text-indigo-600 transition-colors",
                    isSelected ? "text-indigo-600 font-bold" : "text-slate-400"
                  )}
                >
                  {getDayName(dayData.dateStr)}
                </span>
              );
            })}
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
              Usage by app ({formatDateFriendly(selectedDate).toLowerCase()})
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
                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                        className="w-8 h-8 rounded-md"
                        alt={domain}
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
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
                    <button
                      onClick={() => {
                        const mins = prompt(
                          `Set daily limit for ${domain} in minutes (0 to remove):`,
                          config.dailyLimit ? (config.dailyLimit / 60).toString() : '0'
                        );
                        if (mins !== null) {
                          const limitSecs = parseInt(mins) > 0 ? parseInt(mins) * 60 : null;
                          updateSiteLimit(domain, limitSecs);
                        }
                      }}
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
                onClick={() => {
                  const mins = prompt('Set daily overall goal in minutes:', globalSettings.dailyGoal.toString());
                  if (mins) {
                    const parsed = parseInt(mins);
                    if (!isNaN(parsed) && parsed > 0) {
                      updateGlobalSetting('dailyGoal', parsed);
                    }
                  }
                }}
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
    </div>
  );
};

export default ActivityDetails;
