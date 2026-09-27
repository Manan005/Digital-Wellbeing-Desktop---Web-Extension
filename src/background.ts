/**
 * background.ts
 * Core background tracking service worker for Digital Wellbeing extension.
 * Groups tracking metrics by local calendar date (YYYY-MM-DD).
 */

import type { DomainMetrics, SiteSettings, SessionTuple } from './utils/storage';
import {
  getLocalDateStr,
  sessionKey,
  appendHeartbeat,
  findExpiredKeys,
} from './utils/storage';

let activeDomain: string | null = null;
let lastActiveDomain: string | null = null;
let lastPrunedDate: string | null = null;

// Serialises storage read-modify-write cycles so concurrent increments
// (heartbeat + tab switch) can't overwrite each other's writes.
let writeChain: Promise<unknown> = Promise.resolve();
const enqueueWrite = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => {});
  return next;
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

// Delete daily totals / session logs past their retention window (once per day)
const pruneOldData = async () => {
  const today = getLocalDateStr();
  if (lastPrunedDate === today) return;
  lastPrunedDate = today;
  try {
    const allData = await chrome.storage.local.get(null);
    const expired = findExpiredKeys(Object.keys(allData), today);
    if (expired.length > 0) {
      await chrome.storage.local.remove(expired);
    }
  } catch (err) {
    console.error('Failed to prune old data:', err);
  }
};

// Helper to increment timesOpened for a domain
const incrementTimesOpened = (domain: string) => enqueueWrite(async () => {
  const dateKey = getLocalDateStr();
  const result = await chrome.storage.local.get(dateKey);
  const dayData = result[dateKey] || {};
  const metrics: DomainMetrics = dayData[domain] || { timeSpentSeconds: 0, timesOpened: 0 };

  metrics.timesOpened += 1;
  dayData[domain] = metrics;

  await chrome.storage.local.set({ [dateKey]: dayData });
});

// The tab showing `domain`: the heartbeat's own tab when known, otherwise the
// active tab of the last focused window (a service worker has no "current" window).
const findTabFor = async (domain: string, tabId?: number): Promise<number | null> => {
  if (tabId !== undefined) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id && tab.url && getDomain(tab.url) === domain ? tab.id : null;
};

// Helper to increment timeSpentSeconds for active domain and log the session
const incrementTimeSpent = async (domain: string, tabId?: number) => {
  const dateKey = getLocalDateStr();
  if (lastPrunedDate !== dateKey) pruneOldData();

  const metrics = await enqueueWrite(async () => {
    const sessKey = sessionKey(dateKey);
    const result = await chrome.storage.local.get([dateKey, sessKey]);
    const dayData = result[dateKey] || {};
    const metrics: DomainMetrics = dayData[domain] || { timeSpentSeconds: 0, timesOpened: 0 };
    const sessions: SessionTuple[] = Array.isArray(result[sessKey]) ? result[sessKey] : [];

    metrics.timeSpentSeconds += 1;
    dayData[domain] = metrics;
    appendHeartbeat(sessions, domain, Math.floor(Date.now() / 1000));

    await chrome.storage.local.set({ [dateKey]: dayData, [sessKey]: sessions });
    return metrics;
  });

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
    const target = await findTabFor(domain, tabId);
    if (target !== null) {
      chrome.tabs.sendMessage(target, {
        type: 'SHOW_NOTCH',
        minutes: Math.floor(metrics.timeSpentSeconds / 60),
        domain: domain
      }).catch(() => {}); // e.g. the dashboard page, which has no content script
    }
  }

  // Daily limit enforcement logic
  if (siteConfig.dailyLimit !== null && metrics.timeSpentSeconds >= siteConfig.dailyLimit) {
    const target = await findTabFor(domain, tabId);
    if (target !== null) {
      chrome.tabs.sendMessage(target, {
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
    // Chrome lost focus: coming back to the same site counts as a new open
    activeDomain = null;
    lastActiveDomain = null;
  } else {
    await updateActiveTab();
    if (activeDomain && activeDomain !== lastActiveDomain) {
      await incrementTimesOpened(activeDomain);
      lastActiveDomain = activeDomain;
    }
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.url) {
    const domain = getDomain(tab.url);
    if (domain) {
      await checkAndEnforceLimit(tabId, domain);
    }
  }
  if (changeInfo.status === 'complete' && tab.url) {
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

    const dashboardBaseUrl = chrome.runtime.getURL('index.html');

    // Query for existing dashboard tabs to prevent creating duplicate tabs
    chrome.tabs.query({ url: `${dashboardBaseUrl}*` }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const existingTab = tabs[0];
        if (existingTab.id) {
          chrome.tabs.update(existingTab.id, { active: true, url: targetUrl }, () => {
            if (existingTab.windowId) {
              chrome.windows.update(existingTab.windowId, { focused: true });
            }
          });
        }
      } else {
        chrome.tabs.create({ url: targetUrl });
      }
    });
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
      incrementTimeSpent(domain, sender.tab?.id);
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
      // Skip settings, siteSettings, lastTrackedDate, YYYY-MM-DD and sessions:* keys
      if (key === 'settings' || key === 'siteSettings' || datePattern.test(key) || key === 'lastTrackedDate' || key.startsWith('sessions:')) {
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
  await pruneOldData();
  await updateActiveTab();
  lastActiveDomain = activeDomain;
};
initialize();
