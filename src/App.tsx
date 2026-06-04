import React, { useState, useEffect } from 'react';
import { LayoutDashboard, ExternalLink, Clock, Timer, Bell } from 'lucide-react';
import clsx from 'clsx';

// Types
interface SiteData {
  timeSpentToday: number;
  dailyLimit: number | null;
  periodicAlerts: boolean;
}

const App: React.FC = () => {
  const [width, setWidth] = useState(window.innerWidth);
  const [storageData, setStorageData] = useState<Record<string, SiteData>>({});
  const [globalSettings, setGlobalSettings] = useState({
    dailyGoal: 150, // 2h 30m
    periodicAlerts: true,
  });

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    
    // Fetch initial data
    chrome.storage.local.get(null).then((data) => {
      const { dailyGoal, periodicAlerts, ...siteData } = data as any;
      setStorageData(siteData);
      if (dailyGoal !== undefined) setGlobalSettings(prev => ({ ...prev, dailyGoal }));
      if (periodicAlerts !== undefined) setGlobalSettings(prev => ({ ...prev, periodicAlerts }));
    });

    // Listen for storage changes
    const listener = () => {
      chrome.storage.local.get(null).then((data) => {
        const { dailyGoal, periodicAlerts, ...siteData } = data as any;
        setStorageData(siteData);
      });
    };
    chrome.storage.onChanged.addListener(listener);

    return () => {
      window.removeEventListener('resize', handleResize);
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const updateGlobalSetting = (key: string, value: any) => {
    setGlobalSettings(prev => ({ ...prev, [key]: value }));
    chrome.storage.local.set({ [key]: value });
  };

  const updateSiteLimit = (domain: string, limit: number | null) => {
    const updated = { ...storageData[domain], dailyLimit: limit };
    setStorageData(prev => ({ ...prev, [domain]: updated }));
    chrome.storage.local.set({ [domain]: updated });
  };

  const sortedSites = Object.entries(storageData)
    .sort(([, a], [, b]) => b.timeSpentToday - a.timeSpentToday);

  const totalMinutes = Math.floor(
    Object.values(storageData).reduce((acc, curr) => acc + (curr.timeSpentToday || 0), 0) / 60
  );

  if (width < 600) {
    return <CompactPopup totalMinutes={totalMinutes} topSites={sortedSites.slice(0, 3)} />;
  }

  return (
    <FullDashboard 
      totalMinutes={totalMinutes} 
      allSites={sortedSites} 
      settings={globalSettings}
      onUpdateSetting={updateGlobalSetting}
      onUpdateLimit={updateSiteLimit}
    />
  );
};

const CompactPopup: React.FC<{ totalMinutes: number; topSites: [string, SiteData][] }> = ({
  totalMinutes,
  topSites,
}) => {
  const openDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  };

  return (
    <div className="w-[350px] p-4 bg-gray-900 text-white font-sans">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <LayoutDashboard className="text-blue-400" />
          Wellbeing
        </h1>
        <button 
          onClick={openDashboard}
          className="p-2 hover:bg-gray-800 rounded-full transition-colors"
        >
          <ExternalLink size={18} />
        </button>
      </div>

      <div className="bg-gray-800 rounded-2xl p-6 mb-6 text-center shadow-lg border border-gray-700">
        <p className="text-gray-400 text-sm uppercase tracking-wider mb-1">Today's Usage</p>
        <div className="text-4xl font-black text-blue-400">
          {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Top Apps</h2>
        {topSites.map(([domain, data]) => (
          <div key={domain} className="flex items-center justify-between bg-gray-800/50 p-3 rounded-xl">
            <span className="font-medium truncate max-w-[180px]">{domain}</span>
            <span className="text-blue-300 font-mono">
              {Math.floor(data.timeSpentToday / 60)}m
            </span>
          </div>
        ))}
        {topSites.length === 0 && (
          <p className="text-gray-500 text-center py-4">No activity tracked yet.</p>
        )}
      </div>
    </div>
  );
};

const FullDashboard: React.FC<{ 
  totalMinutes: number; 
  allSites: [string, SiteData][];
  settings: { dailyGoal: number; periodicAlerts: boolean };
  onUpdateSetting: (key: string, value: any) => void;
  onUpdateLimit: (domain: string, limit: number | null) => void;
}> = ({
  totalMinutes,
  allSites,
  settings,
  onUpdateSetting,
  onUpdateLimit,
}) => {
  return (
    <div className="flex-1 p-10 bg-[#f8f9ff] text-slate-900 min-h-screen font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="flex flex-col items-center mb-12 text-center">
          <h1 className="text-3xl font-medium text-slate-800 mb-6">App activity details</h1>
          
          <div className="inline-flex items-center gap-2 bg-[#e8ebff] text-[#3f51b5] px-4 py-2 rounded-full text-sm font-bold mb-8 cursor-pointer hover:bg-[#dce0ff] transition-colors">
            Screen time <LayoutDashboard size={16} />
          </div>

          <div className="mb-2">
            <span className="text-5xl font-medium text-slate-800">
              {Math.floor(totalMinutes / 60)} hr, {totalMinutes % 60} mins
            </span>
          </div>
          <div className="text-slate-500 text-sm">Today</div>
        </header>

        <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 mb-10">
          <div className="flex items-end justify-between gap-2 h-48 mb-4 border-b border-slate-100 pb-2">
            {[3.5, 2, 0, 0, 0, 0, 0].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center group h-full justify-end">
                <div 
                  className={clsx(
                    "w-12 transition-all rounded-t-sm relative",
                    i === 0 ? "bg-[#c1d3ff]" : "bg-[#0055ff]"
                  )}
                  style={{ height: `${(h / 4) * 100}%` }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {h}h
                  </div>
                </div>
              </div>
            ))}
            <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col justify-between h-48 text-[10px] text-slate-400 pointer-events-none">
              <span>4h</span>
              <span>3h</span>
              <span>2h</span>
              <span>1h</span>
              <span>0h</span>
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 uppercase tracking-widest px-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between px-4">
            <h2 className="text-xl font-medium text-slate-800">Usage by app</h2>
            <div className="flex items-center gap-4 text-slate-500">
              <ExternalLink size={20} className="cursor-pointer" />
            </div>
          </div>

          <div className="space-y-1">
            {allSites.map(([domain, data]) => (
              <div key={domain} className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-2xl transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center">
                    <img 
                      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} 
                      className="w-8 h-8"
                      alt={domain}
                    />
                  </div>
                  <div>
                    <div className="font-medium text-lg text-slate-800">{domain}</div>
                    <div className="text-sm text-slate-500">
                      {Math.floor(data.timeSpentToday / 3600)} hr, {Math.floor((data.timeSpentToday % 3600) / 60)} mins
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-[1px] bg-slate-100 mx-2" />
                  <button 
                    onClick={() => {
                      const mins = prompt('Set daily limit in minutes (0 to remove):', (data.dailyLimit ? data.dailyLimit / 60 : 0).toString());
                      if (mins !== null) {
                        onUpdateLimit(domain, parseInt(mins) > 0 ? parseInt(mins) * 60 : null);
                      }
                    }}
                    className={clsx(
                      "p-3 rounded-xl transition-colors",
                      data.dailyLimit ? "bg-blue-50 text-blue-600" : "text-slate-400 hover:bg-slate-100"
                    )}
                  >
                    <Timer size={24} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 pt-10 border-t border-slate-200">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-8">Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800">Periodic Alerts</div>
                <div className="text-xs text-slate-400">Show notch every 5 minutes</div>
              </div>
              <button 
                onClick={() => onUpdateSetting('periodicAlerts', !settings.periodicAlerts)}
                className={clsx(
                  "w-14 h-8 rounded-full transition-all p-1 relative",
                  settings.periodicAlerts ? "bg-blue-600" : "bg-slate-200"
                )}
              >
                <div className={clsx(
                  "w-6 h-6 bg-white rounded-full shadow-sm transition-all",
                  settings.periodicAlerts ? "translate-x-6" : "translate-x-0"
                )} />
              </button>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800">Daily Goal</div>
                <div className="text-xs text-slate-400">Target screen time</div>
              </div>
              <button 
                onClick={() => {
                  const mins = prompt('Set daily goal in minutes:', settings.dailyGoal.toString());
                  if (mins) onUpdateSetting('dailyGoal', parseInt(mins));
                }}
                className="text-blue-600 font-bold hover:bg-blue-50 px-4 py-2 rounded-xl transition-colors"
              >
                {Math.floor(settings.dailyGoal / 60)}h {settings.dailyGoal % 60}m
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
