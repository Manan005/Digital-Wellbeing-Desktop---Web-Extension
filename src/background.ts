/**
 * background.ts
 * Service worker for tracking active tab time and managing notifications.
 */

interface SiteData {
  timeSpentToday: number;
  dailyLimit: number | null;
  periodicAlerts: boolean;
}

interface StorageData {
  [domain: string]: SiteData;
}

let activeDomain: string | null = null;
let lastTickTime = Date.now();

// Helper to get domain from URL
const getDomain = (url: string): string | null => {
  try {
    const hostname = new URL(url).hostname;
    return hostname;
  } catch {
    return null;
  }
};

// Update active domain based on current tab
const updateActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.url) {
    activeDomain = getDomain(tab.url);
  } else {
    activeDomain = null;
  }
};

// Listen for tab changes
chrome.tabs.onActivated.addListener(updateActiveTab);
chrome.windows.onFocusChanged.addListener(updateActiveTab);
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    updateActiveTab();
  }
});

// Ticking interval
setInterval(async () => {
  if (!activeDomain) return;

  const now = Date.now();
  const delta = Math.floor((now - lastTickTime) / 1000);
  if (delta < 1) return;
  lastTickTime = now;

  const allData = await chrome.storage.local.get(null);
  const { dailyGoal, periodicAlerts, ...siteDataMap } = allData as any;
  
  const siteData = siteDataMap[activeDomain] || {
    timeSpentToday: 0,
    dailyLimit: null,
    periodicAlerts: true,
  };

  siteData.timeSpentToday += delta;
  await chrome.storage.local.set({ [activeDomain]: siteData });

  // 5-minute alert logic
  // Use global periodicAlerts setting
  const isAlertEnabled = periodicAlerts !== undefined ? periodicAlerts : true;
  if (isAlertEnabled && siteData.timeSpentToday > 0 && siteData.timeSpentToday % 300 === 0) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url && getDomain(tab.url) === activeDomain) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_NOTCH',
        minutes: Math.floor(siteData.timeSpentToday / 60),
        domain: activeDomain
      });
    }
  }

  // Daily limit logic
  if (siteData.dailyLimit && siteData.timeSpentToday >= siteData.dailyLimit) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url && getDomain(tab.url) === activeDomain) {
      chrome.tabs.sendMessage(tab.id, { 
        type: 'SHOW_BLOCKER',
        domain: activeDomain
      });
    }
  }
}, 1000);

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'OPEN_DASHBOARD') {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  }
});

// Initialize on startup
updateActiveTab();
