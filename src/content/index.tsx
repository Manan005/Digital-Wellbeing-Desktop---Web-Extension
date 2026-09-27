import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './content.css';
import { SiteIcon } from '../components/SiteIcon';
import type { SiteIcon as SiteIconInfo } from '../utils/storage';
import { getLocalDateStr } from '../utils/storage';

const NOTCH_VISIBLE_MS = 4000;
const NOTCH_EXIT_MS = 250;
const ROOT_ID = 'digital-wellbeing-content-root';

// This script can run more than once in a page: once from the manifest and again
// when the background injects it into tabs that were open before an install or
// update. Each copy tags the root with its own id; the newest copy replaces the
// root, and older copies notice and shut down, so a tab never sends two heartbeats.
const INSTANCE = Math.random().toString(36).slice(2);

/** False once the extension has been reloaded or removed ("Extension context invalidated"). */
const isAlive = (): boolean => {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
};

let shutdown: () => void = () => {};

/** sendMessage throws synchronously in an orphaned script, so .catch alone isn't enough. */
const send = (message: Record<string, unknown>): void => {
  if (!isAlive()) {
    shutdown();
    return;
  }
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    shutdown();
  }
};

/**
 * This page's own favicon. The notch lives inside the page, whose CSP usually
 * allows same-origin images but not chrome-extension:// or Google URLs.
 */
const pageIcon = (): SiteIconInfo => {
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]');
  return { icon: link?.href || `${location.origin}/favicon.ico`, origin: location.origin };
};

/** "15m", "1h", "1h 5m" — the way Android's Digital Wellbeing words it. */
const formatUsed = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

const ContentApp: React.FC = () => {
  const [showNotch, setShowNotch] = useState(false);
  const [notchLeaving, setNotchLeaving] = useState(false);
  const [notchMinutes, setNotchMinutes] = useState(0);
  const [notchDomain, setNotchDomain] = useState('');
  const notchTimers = useRef<number[]>([]);
  const [showBlocker, setShowBlocker] = useState(false);
  const [blockedDomain, setBlockedDomain] = useState('');

  const checkLimitDirectly = async () => {
    try {
      let hostname = window.location.hostname;
      if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4);
      }
      if (!hostname) return;

      const dateKey = getLocalDateStr();
      const storage = await chrome.storage.local.get([dateKey, 'siteSettings']);
      const dayData = storage[dateKey] || {};
      const metrics = dayData[hostname] || { timeSpentSeconds: 0 };
      const siteSettingsMap = storage.siteSettings || {};
      const siteConfig = siteSettingsMap[hostname] || { dailyLimit: null };

      if (siteConfig.dailyLimit !== null && metrics.timeSpentSeconds >= siteConfig.dailyLimit) {
        setBlockedDomain(hostname);
        setShowBlocker(true);
      } else {
        setShowBlocker(false);
      }
    } catch (e) {
      // Ignore
    }
  };

  useEffect(() => {
    const listener = (message: any) => {
      if (message.type === 'SHOW_NOTCH') {
        // A new alert restarts the timers instead of being cut short by the previous one
        notchTimers.current.forEach(clearTimeout);
        setNotchMinutes(message.minutes);
        setNotchDomain(message.domain);
        setNotchLeaving(false);
        setShowNotch(true);
        notchTimers.current = [
          window.setTimeout(() => setNotchLeaving(true), NOTCH_VISIBLE_MS),
          window.setTimeout(() => setShowNotch(false), NOTCH_VISIBLE_MS + NOTCH_EXIT_MS),
        ];
      }
      if (message.type === 'SHOW_BLOCKER') {
        setBlockedDomain(message.domain);
        setShowBlocker(true);
      }
      if (message.type === 'HIDE_BLOCKER') {
        setShowBlocker(false);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    
    // Initial limit check on load
    checkLimitDirectly();
    send({ type: 'CHECK_LIMIT', domain: window.location.hostname });

    return () => {
      try {
        chrome.runtime.onMessage.removeListener(listener);
      } catch {
        // context already invalidated
      }
      notchTimers.current.forEach(clearTimeout);
    };
  }, []);

  // Real-time listener for siteSettings mutation (e.g. when timer deleted in dashboard)
  useEffect(() => {
    const storageListener = () => {
      checkLimitDirectly();
      send({ type: 'CHECK_LIMIT', domain: window.location.hostname });
    };
    chrome.storage.onChanged.addListener(storageListener);
    return () => {
      try {
        chrome.storage.onChanged.removeListener(storageListener);
      } catch {
        // context already invalidated
      }
    };
  }, []);

  return (
    <div className="digital-wellbeing-wrapper">
      {showNotch && (
        <div
          className={`dw-notch-container${notchLeaving ? ' dw-notch-container--leaving' : ''}`}
          role="status"
          aria-live="polite"
        >
          <div
            className="dw-notch"
            onClick={() => send({ type: 'OPEN_DASHBOARD' })}
            title="Open Digital Wellbeing"
          >
            <span className="dw-notch-icon">
              <SiteIcon domain={notchDomain} known={pageIcon()} />
            </span>
            <span className="dw-notch-text">Used for {formatUsed(notchMinutes)}</span>
          </div>
        </div>
      )}

      {showBlocker && (
        <div className="dw-blocker-overlay">
          <div className="dw-blocker-dialog">
            <div className="dw-blocker-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H7M17 19H7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="dw-blocker-title">App paused</h1>
            <p className="dw-blocker-message">
              Your {blockedDomain || window.location.hostname} timer ran out. It'll start again tomorrow.
            </p>
            <div className="dw-blocker-footer">
              <button 
                className="dw-btn-text" 
                onClick={() => send({ type: 'OPEN_DASHBOARD', domain: blockedDomain || window.location.hostname })}
              >
                Settings
              </button>
              <button 
                className="dw-btn-primary" 
                onClick={() => send({ type: 'CLOSE_TAB' })}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Take over from any earlier copy of this script (see INSTANCE above)
document.getElementById(ROOT_ID)?.remove();
const root = document.createElement('div');
root.id = ROOT_ID;
root.dataset.instance = INSTANCE;
document.body.appendChild(root);
const reactRoot = ReactDOM.createRoot(root);
reactRoot.render(<ContentApp />);

const isCurrent = () => root.isConnected && root.dataset.instance === INSTANCE;

// Heartbeat: one tick per second while the page is focused and visible
const heartbeat = window.setInterval(() => {
  if (!isCurrent()) {
    shutdown();
    return;
  }
  if (document.hasFocus() && document.visibilityState === 'visible') {
    send({ type: 'HEARTBEAT', domain: window.location.hostname });
  }
}, 1000);

shutdown = () => {
  shutdown = () => {};
  window.clearInterval(heartbeat);
  setTimeout(() => {
    reactRoot.unmount();
    if (isCurrent()) root.remove();
  }, 0);
};
