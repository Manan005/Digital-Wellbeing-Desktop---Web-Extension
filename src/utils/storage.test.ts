import { describe, it, expect } from 'vitest';
import {
  appendHeartbeat,
  findExpiredKeys,
  addDays,
  dateStrsBetween,
  isSessionKey,
  sessionKey,
  type SessionTuple,
} from './storage';

describe('appendHeartbeat', () => {
  it('starts a session on the first heartbeat', () => {
    const s: SessionTuple[] = [];
    appendHeartbeat(s, 'youtube.com', 1000);
    expect(s).toEqual([['youtube.com', 1000, 1]]);
  });

  it('extends the session on consecutive heartbeats', () => {
    const s: SessionTuple[] = [];
    appendHeartbeat(s, 'youtube.com', 1000);
    appendHeartbeat(s, 'youtube.com', 1001);
    appendHeartbeat(s, 'youtube.com', 1002);
    expect(s).toEqual([['youtube.com', 1000, 3]]);
  });

  it('bridges short gaps (tab briefly unfocused) into the same session', () => {
    const s: SessionTuple[] = [];
    appendHeartbeat(s, 'youtube.com', 1000);
    appendHeartbeat(s, 'youtube.com', 1010); // 9 s gap after end (1001)
    expect(s).toHaveLength(1);
    expect(s[0][2]).toBe(10); // duration covers wall-clock span
  });

  it('starts a new session after a long gap', () => {
    const s: SessionTuple[] = [];
    appendHeartbeat(s, 'youtube.com', 1000);
    appendHeartbeat(s, 'youtube.com', 1100);
    expect(s).toEqual([
      ['youtube.com', 1000, 1],
      ['youtube.com', 1100, 1],
    ]);
  });

  it('starts a new session when the domain changes', () => {
    const s: SessionTuple[] = [];
    appendHeartbeat(s, 'youtube.com', 1000);
    appendHeartbeat(s, 'github.com', 1001);
    appendHeartbeat(s, 'youtube.com', 1002);
    expect(s.map((x) => x[0])).toEqual(['youtube.com', 'github.com', 'youtube.com']);
  });
});

describe('date helpers', () => {
  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('dateStrsBetween is inclusive and chronological', () => {
    expect(dateStrsBetween('2026-09-29', '2026-10-02')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('recognises session keys', () => {
    expect(isSessionKey(sessionKey('2026-09-27'))).toBe(true);
    expect(isSessionKey('sessions:nope')).toBe(false);
    expect(isSessionKey('2026-09-27')).toBe(false);
  });
});

describe('findExpiredKeys', () => {
  const today = '2026-09-27';
  it('keeps recent keys and settings, drops old ones', () => {
    const keys = [
      'settings',
      'siteSettings',
      today,
      '2025-09-28', // 364 days old: keep
      '2025-09-26', // 366 days old: drop
      sessionKey('2026-07-01'), // 88 days: keep
      sessionKey('2026-06-27'), // 92 days: drop
    ];
    expect(findExpiredKeys(keys, today).sort()).toEqual(['2025-09-26', sessionKey('2026-06-27')].sort());
  });
});
