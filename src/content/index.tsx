import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './content.css';

const ContentApp: React.FC = () => {
  const [showNotch, setShowNotch] = useState(false);
  const [notchMinutes, setNotchMinutes] = useState(0);
  const [notchDomain, setNotchDomain] = useState('');
  const [showBlocker, setShowBlocker] = useState(false);
  const [blockedDomain, setBlockedDomain] = useState('');

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
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
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
          <div className="dw-notch">
            <div className="dw-notch-icon">
              <img 
                src={`https://www.google.com/s2/favicons?domain=${notchDomain}&sz=64`} 
                alt="" 
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
              Your {blockedDomain} timer ran out. It'll start again tomorrow.
            </p>
            <div className="dw-blocker-footer">
              <button className="dw-btn-text" onClick={() => chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' })}>
                Settings
              </button>
              <button className="dw-btn-primary" onClick={() => window.close()}>
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
