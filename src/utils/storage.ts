/**
 * storage.ts
 * Shared storage schema, key helpers and pure session-log logic.
 * Used by the background worker, the content script and the dashboard so the
 * schema is defined in exactly one place.
 *
 * chrome.storage.local layout:
 *   "YYYY-MM-DD"           -> DayData      (per-domain daily totals)
 *   "sessions:YYYY-MM-DD"  -> SessionTuple[] (visit log for that day)
 *   "settings"             -> GlobalSettings
 *   "siteSettings"         -> Record<domain, SiteSettings>
 */

import { DEFAULT_THEME, type ThemeSetting } from './theme';

export interface DomainMetrics {
  timeSpentSeconds: number;
  timesOpened: number;
}

export interface SiteSettings {
  dailyLimit: number | null; // in seconds
  periodicAlerts: boolean;
}

export interface GlobalSettings {
  dailyGoal: number; // in minutes
  periodicAlerts: boolean;
  /** Optional so profiles written before the theme existed still load. */
  theme?: ThemeSetting;
}

export type DayData = Record<string, DomainMetrics>;

/** Compact visit record: [domain, startEpochSeconds, durationSeconds] */
export type SessionTuple = [string, number, number];

export const SESSION_KEY_PREFIX = 'sessions:';
export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Heartbeats further apart than this start a new session. */
export const SESSION_GAP_SECONDS = 15;
/** How long to keep each kind of record. */
export const SESSION_RETENTION_DAYS = 90;
export const DAILY_RETENTION_DAYS = 365;

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = { dailyGoal: 150, periodicAlerts: true, theme: DEFAULT_THEME };
export const DEFAULT_SITE_SETTINGS: SiteSettings = { dailyLimit: null, periodicAlerts: true };

// ─── Date helpers (all in local time) ────────────────────────────────────────

export const toLocalDateStr = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getLocalDateStr = (): string => toLocalDateStr(new Date());

export const parseDateStr = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/** Returns dateStr shifted by `days` (negative goes backwards). */
export const addDays = (dateStr: string, days: number): string => {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
};

/** Inclusive list of date strings from `from` to `to` (chronological). */
export const dateStrsBetween = (from: string, to: string): string[] => {
  const dates: string[] = [];
  let cur = from;
  while (cur <= to) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
};

/** An extension page URL in Chrome/Edge/Brave (chrome-extension://) or Firefox (moz-extension://). */
export const isExtensionUrl = (url: string): boolean => /^(chrome|moz)-extension:\/\//.test(url);

// ─── Key helpers ─────────────────────────────────────────────────────────────

export const sessionKey = (dateStr: string): string => `${SESSION_KEY_PREFIX}${dateStr}`;
export const isDateKey = (key: string): boolean => DATE_KEY_RE.test(key);
export const isSessionKey = (key: string): boolean =>
  key.startsWith(SESSION_KEY_PREFIX) && DATE_KEY_RE.test(key.slice(SESSION_KEY_PREFIX.length));

// ─── Session log ─────────────────────────────────────────────────────────────

/**
 * Records one heartbeat (1 s of active time on `domain`) into a day's session
 * list. Extends the last session when it is the same domain and ended within
 * SESSION_GAP_SECONDS; otherwise starts a new one.
 * Mutates and returns `sessions` (called every second, so no copying).
 */
export const appendHeartbeat = (
  sessions: SessionTuple[],
  domain: string,
  nowSec: number
): SessionTuple[] => {
  const last = sessions[sessions.length - 1];
  if (last && last[0] === domain) {
    const endSec = last[1] + last[2];
    if (nowSec - endSec <= SESSION_GAP_SECONDS) {
      last[2] = Math.max(last[2] + 1, nowSec - last[1]);
      return sessions;
    }
  }
  sessions.push([domain, nowSec, 1]);
  return sessions;
};

/** Storage keys older than the retention windows, given every key in storage. */
export const findExpiredKeys = (allKeys: string[], today: string = getLocalDateStr()): string[] => {
  const oldestDaily = addDays(today, -DAILY_RETENTION_DAYS);
  const oldestSession = addDays(today, -SESSION_RETENTION_DAYS);
  return allKeys.filter((key) => {
    if (isDateKey(key)) return key < oldestDaily;
    if (isSessionKey(key)) return key.slice(SESSION_KEY_PREFIX.length) < oldestSession;
    return false;
  });
};
