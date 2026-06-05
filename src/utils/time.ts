/**
 * time.ts
 * Utility functions for date generation and tracking duration formatting.
 */

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
 * Returns an array of the last 7 calendar date strings (YYYY-MM-DD),
 * ordered chronologically, ending with today.
 */
export const getLast7Days = (): string[] => {
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
};
