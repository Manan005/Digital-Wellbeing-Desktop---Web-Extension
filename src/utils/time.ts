/**
 * time.ts
 * Utility functions for date generation and tracking duration formatting.
 */

import { toLocalDateStr } from './storage';

/**
 * Formats seconds into a human-readable duration string.
 * - Under 60 seconds: returns "< 1 min" (or similar short representation, or raw seconds like "45 sec").
 * - Under 60 minutes: returns only minutes (e.g. "20 min" or "20 mins"), no hours shown.
 * - 60 minutes and above: returns hours and minutes (e.g. "1 hr 15 min").
 */
export const formatSeconds = (seconds: number): string => {
  if (seconds <= 0) return '0 mins';
  let minutes = Math.floor(seconds / 60);
  if (minutes === 0 && seconds > 0) {
    minutes = 1;
  }
  if (minutes < 60) {
    return `${minutes} mins`;
  }
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs} hr, ${mins} mins`;
};

/**
 * Compact duration for chat answers: "45s", "12m", "1h 05m".
 */
export const formatDurationShort = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hrs}h` : `${hrs}h ${String(mins).padStart(2, '0')}m`;
};

/** "Mon, Sep 22" style label for a YYYY-MM-DD string. */
export const formatDateShort = (dateStr: string): string => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

/** "9 AM", "10 PM" for an hour index 0..23. */
export const formatHour = (hour: number): string => {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`;
};

/**
 * Returns an array of the last `n` calendar date strings (YYYY-MM-DD),
 * ordered chronologically, ending with today.
 */
export const getLastNDays = (n: number): string[] => {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(toLocalDateStr(d));
  }
  return dates;
};

export const getLast7Days = (): string[] => getLastNDays(7);
