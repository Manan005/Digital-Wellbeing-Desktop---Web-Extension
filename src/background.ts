/**
 * background.ts
 * Core background tracking service worker for Digital Wellbeing extension.
 * Groups tracking metrics by local calendar date (YYYY-MM-DD).
 */

interface DomainMetrics {
  timeSpentSeconds: number;
  timesOpened: number;
}

interface SiteSettings {
  dailyLimit: number | null; // in seconds
  periodicAlerts: boolean;
}

let activeDomain: string | null = null;
let lastActiveDomain: string | null = null;

// Helper to get local date string YYYY-MM-DD
const getLocalDateStr = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to get domain name stripped of www. and subpages
const getDomain = (url: string): string | null => {
  try {
    if (url.startsWith('chrome-extension://')) {
      const parsed = new URL(url);
      if (parsed.pathname.includes('index.html')) {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
          return chrome.runtime.getURL('index.html');
        }
        return url;
      }
    }
    let hostname = new URL(url).hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    return hostname || null;
  } catch {
    return null;
  }
};

// Update active domain based on focused Chrome window and active tab
const updateActiveTab = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.url) {
      const domain = getDomain(tab.url);
      if (domain) {
        activeDomain = domain;
        return;
      }
    }
  } catch (err) {
    console.error('Error updating active tab:', err);
  }
  activeDomain = null;
};

// Helper to increment timesOpened for a domain
const incrementTimesOpened = async (domain: string) => {
  const dateKey = getLocalDateStr();
  const result = await chrome.storage.local.get(dateKey);
  const dayData = result[dateKey] || {};
  const metrics: DomainMetrics = dayData[domain] || { timeSpentSeconds: 0, timesOpened: 0 };
  
  metrics.timesOpened += 1;
  dayData[domain] = metrics;
  
  await chrome.storage.local.set({ [dateKey]: dayData });
};

// Helper to increment timeSpentSeconds for active domain
const incrementTimeSpent = async (domain: string) => {
  const dateKey = getLocalDateStr();
  const result = await chrome.storage.local.get(dateKey);
  const dayData = result[dateKey] || {};
  const metrics: DomainMetrics = dayData[domain] || { timeSpentSeconds: 0, timesOpened: 0 };
  
  metrics.timeSpentSeconds += 1;
  dayData[domain] = metrics;
  
  await chrome.storage.local.set({ [dateKey]: dayData });

  // Load site settings for daily limit & global alerts checking
  const storage = await chrome.storage.local.get(['siteSettings', 'settings', 'dailyGoal', 'periodicAlerts']);
  const siteSettingsMap = storage.siteSettings || {};
  const globalSettings = storage.settings || { 
    dailyGoal: storage.dailyGoal !== undefined ? storage.dailyGoal : 150, 
    periodicAlerts: storage.periodicAlerts !== undefined ? storage.periodicAlerts : true 
  };

  const siteConfig: SiteSettings = siteSettingsMap[domain] || { dailyLimit: null, periodicAlerts: true };

  // 5-minute periodic alert logic
  const isAlertEnabled = siteConfig.periodicAlerts && globalSettings.periodicAlerts;
  if (isAlertEnabled && metrics.timeSpentSeconds > 0 && metrics.timeSpentSeconds % 300 === 0) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url && getDomain(tab.url) === domain) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_NOTCH',
        minutes: Math.floor(metrics.timeSpentSeconds / 60),
        domain: domain
      });
    }
  }

  // Daily limit enforcement logic
  if (siteConfig.dailyLimit !== null && metrics.timeSpentSeconds >= siteConfig.dailyLimit) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url && getDomain(tab.url) === domain) {
      chrome.tabs.sendMessage(tab.id, { 
        type: 'SHOW_BLOCKER',
        domain: domain
      }).catch(() => {});
    }
  }
};

// Helper to check limit and send SHOW_BLOCKER or HIDE_BLOCKER
const checkAndEnforceLimit = async (tabId: number, domain: string) => {
  const dateKey = getLocalDateStr();
  const storage = await chrome.storage.local.get([dateKey, 'siteSettings']);
  const dayData = storage[dateKey] || {};
  const metrics: DomainMetrics = dayData[domain] || { timeSpentSeconds: 0, timesOpened: 0 };
  const siteSettingsMap = storage.siteSettings || {};
  const siteConfig: SiteSettings = siteSettingsMap[domain] || { dailyLimit: null, periodicAlerts: true };

  if (siteConfig.dailyLimit !== null && metrics.timeSpentSeconds >= siteConfig.dailyLimit) {
    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_BLOCKER',
      domain: domain
    }).catch(() => {});
  } else {
    chrome.tabs.sendMessage(tabId, {
      type: 'HIDE_BLOCKER',
      domain: domain
    }).catch(() => {});
  }
};

// Listen to tab and window activity
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await updateActiveTab();
  if (activeDomain) {
    await checkAndEnforceLimit(activeInfo.tabId, activeDomain);
    if (activeDomain !== lastActiveDomain) {
      await incrementTimesOpened(activeDomain);
      lastActiveDomain = activeDomain;
    }
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    activeDomain = null;
  } else {
    await updateActiveTab();
    if (activeDomain && activeDomain !== lastActiveDomain) {
      await incrementTimesOpened(activeDomain);
      lastActiveDomain = activeDomain;
    }
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const domain = getDomain(tab.url);
    if (domain) {
      await checkAndEnforceLimit(tabId, domain);
    }
    const oldDomain = activeDomain;
    await updateActiveTab();
    if (activeDomain && activeDomain !== oldDomain && activeDomain !== lastActiveDomain) {
      await incrementTimesOpened(activeDomain);
      lastActiveDomain = activeDomain;
    }
  }
});

// Open dashboard in full page or process HEARTBEAT tracking ticks from content scripts
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'OPEN_DASHBOARD') {
    const targetUrl = message.domain
      ? chrome.runtime.getURL(`index.html?domain=${encodeURIComponent(message.domain)}`)
      : chrome.runtime.getURL('index.html');
    chrome.tabs.create({ url: targetUrl });
  } else if (message.type === 'CLOSE_TAB') {
    if (sender.tab?.id) {
      chrome.tabs.remove(sender.tab.id);
    }
  } else if (message.type === 'CHECK_LIMIT') {
    const domain = getDomain(sender.tab?.url || message.domain);
    if (domain && sender.tab?.id) {
      checkAndEnforceLimit(sender.tab.id, domain);
    }
  } else if (message.type === 'HEARTBEAT') {
    const domain = getDomain(sender.tab?.url || message.domain);
    if (domain) {
      if (sender.tab?.id) {
        checkAndEnforceLimit(sender.tab.id, domain);
      }
      incrementTimeSpent(domain);
    }
  }
});

// Migration helper to convert legacy root-level domain structures to date-based keys
const migrateOldStorageSchema = async () => {
  try {
    const allData = await chrome.storage.local.get(null);
    const todayStr = getLocalDateStr();
    const keysToRemove: string[] = [];
    const updates: Record<string, any> = {};

    const siteSettings = allData.siteSettings || {};
    let settings = allData.settings || null;

    // Preserve legacy dailyGoal and periodicAlerts at the root
    if (!settings) {
      settings = {
        dailyGoal: allData.dailyGoal !== undefined ? allData.dailyGoal : 150,
        periodicAlerts: allData.periodicAlerts !== undefined ? allData.periodicAlerts : true,
      };
      updates.settings = settings;
      if (allData.dailyGoal !== undefined) keysToRemove.push('dailyGoal');
      if (allData.periodicAlerts !== undefined) keysToRemove.push('periodicAlerts');
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    for (const [key, val] of Object.entries(allData)) {
      // Skip settings, siteSettings, lastTrackedDate, and YYYY-MM-DD keys
      if (key === 'settings' || key === 'siteSettings' || datePattern.test(key) || key === 'lastTrackedDate') {
        continue;
      }

      // If key is a domain (has a dot) and val is an object with tracking information
      if (key.includes('.') && typeof val === 'object' && val !== null) {
        const site = val as any;
        const domain = key;

        // 1. Migrate history if it exists
        if (site.history && typeof site.history === 'object') {
          for (const [dateStr, seconds] of Object.entries(site.history)) {
            if (datePattern.test(dateStr) && typeof seconds === 'number') {
              if (!updates[dateStr]) {
                updates[dateStr] = { ...(updates[dateStr] || allData[dateStr] || {}) };
              }
              updates[dateStr][domain] = {
                timeSpentSeconds: seconds,
                timesOpened: updates[dateStr][domain]?.timesOpened || site.timesOpened || 1
              };
            }
          }
        }

        // 2. Migrate today's current timeSpentToday/timeSpent
        const todaySeconds = site.timeSpentToday ?? site.timeSpent ?? 0;
        if (typeof todaySeconds === 'number' && todaySeconds > 0) {
          if (!updates[todayStr]) {
            updates[todayStr] = { ...(updates[todayStr] || allData[todayStr] || {}) };
          }
          updates[todayStr][domain] = {
            timeSpentSeconds: todaySeconds,
            timesOpened: updates[todayStr][domain]?.timesOpened || site.timesOpened || 1
          };
        }

        // 3. Migrate custom limits to siteSettings map
        if (site.dailyLimit !== undefined || site.periodicAlerts !== undefined) {
          siteSettings[domain] = {
            dailyLimit: site.dailyLimit !== undefined ? site.dailyLimit : null,
            periodicAlerts: site.periodicAlerts !== undefined ? site.periodicAlerts : true,
          };
        }

        keysToRemove.push(domain);
      }
    }

    if (Object.keys(updates).length > 0 || Object.keys(siteSettings).length > 0) {
      updates.siteSettings = siteSettings;
      await chrome.storage.local.set(updates);
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  } catch (err) {
    console.error('Failed to run storage schema migration:', err);
  }
};

// Initialize on service worker wakeup
const initialize = async () => {
  await migrateOldStorageSchema();
  await updateActiveTab();
  lastActiveDomain = activeDomain;
};
initialize();
