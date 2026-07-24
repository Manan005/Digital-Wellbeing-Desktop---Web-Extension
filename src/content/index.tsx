import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './content.css';
import { getFaviconUrl } from '../utils/favicon';

const ContentApp: React.FC = () => {
  const [showNotch, setShowNotch] = useState(false);
  const [notchMinutes, setNotchMinutes] = useState(0);
  const [notchDomain, setNotchDomain] = useState('');
  const [showBlocker, setShowBlocker] = useState(false);
  const [blockedDomain, setBlockedDomain] = useState('');

  const checkLimitDirectly = async () => {
    try {
      let hostname = window.location.hostname;
      if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4);
      }
      if (!hostname) return;

      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;

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
        setNotchMinutes(message.minutes);
        setNotchDomain(message.domain);
        setShowNotch(true);
        setTimeout(() => setShowNotch(false), 4000);
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
    chrome.runtime.sendMessage({ type: 'CHECK_LIMIT', domain: window.location.hostname }).catch(() => {});

    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Real-time listener for siteSettings mutation (e.g. when timer deleted in dashboard)
  useEffect(() => {
    const storageListener = () => {
      checkLimitDirectly();
      chrome.runtime.sendMessage({ type: 'CHECK_LIMIT', domain: window.location.hostname }).catch(() => {});
    };
    chrome.storage.onChanged.addListener(storageListener);
    return () => chrome.storage.onChanged.removeListener(storageListener);
  }, []);

  // Send periodic heartbeat when user is actively viewing/focusing the page
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hasFocus() && document.visibilityState === 'visible') {
        chrome.runtime.sendMessage({ type: 'HEARTBEAT', domain: window.location.hostname }).catch(() => {
          // Suppress errors during tab shutdown or extension reload
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="digital-wellbeing-wrapper">
      {showNotch && (
        <div className="dw-notch-container">
          <div 
            className="dw-notch"
            onClick={() => chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' }).catch(() => {})}
            style={{ cursor: 'pointer' }}
          >
            <div className="dw-notch-icon">
              <img 
                src={getFaviconUrl(notchDomain)} 
                alt={notchDomain} 
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=${notchDomain}&sz=64`;
                }}
              />
            </div>
            <span className="dw-notch-text">Used for {notchMinutes}m</span>
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
                onClick={() => chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD', domain: blockedDomain || window.location.hostname }).catch(() => {})}
              >
                Settings
              </button>
              <button 
                className="dw-btn-primary" 
                onClick={() => chrome.runtime.sendMessage({ type: 'CLOSE_TAB' }).catch(() => {})}
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

const root = document.createElement('div');
root.id = 'digital-wellbeing-content-root';
document.body.appendChild(root);
ReactDOM.createRoot(root).render(<ContentApp />);
