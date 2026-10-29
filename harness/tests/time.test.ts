import { describe, expect, it } from 'vitest';
import { runWindows, zonedParts, zonedTime } from '../lib/time.ts';
import { parseConfig, readConfig } from '../lib/config.ts';

const cfg = { tz: 'Europe/London', startAt: '02:00', startCutoff: '03:00', noNewPhaseAfter: '05:15', hardDeadline: '06:30' };
const utc = (s: string): number => Date.parse(s);
const sec = (s: string): number => utc(s) / 1000;

describe('London time', () => {
  it('reads date, minutes and weekday in London across both DST changes', () => {
    expect(zonedParts(utc('2026-10-24T23:30:00Z'), 'Europe/London')).toEqual({ date: '2026-10-25', minutes: 30, weekday: 0 });
    expect(zonedParts(utc('2026-10-25T01:30:00Z'), 'Europe/London').minutes).toBe(90); // second 01:30 (GMT)
    expect(zonedParts(utc('2027-03-28T01:00:00Z'), 'Europe/London').minutes).toBe(120); // 02:00 BST
  });

  it('converts London wall times to instants on DST and ordinary days', () => {
    expect(zonedTime('2027-03-28', '05:15', 'Europe/London')).toBe(utc('2027-03-28T04:15:00Z'));
    expect(zonedTime('2027-03-27', '05:15', 'Europe/London')).toBe(utc('2027-03-27T05:15:00Z'));
    expect(zonedTime('2026-10-25', '06:30', 'Europe/London')).toBe(utc('2026-10-25T06:30:00Z'));
    expect(zonedTime('2026-10-24', '06:30', 'Europe/London')).toBe(utc('2026-10-24T05:30:00Z'));
    // 01:30 does not exist on spring-forward day: resolves forward to 02:30 BST.
    expect(zonedTime('2027-03-28', '01:30', 'Europe/London')).toBe(utc('2027-03-28T01:30:00Z'));
  });
});

describe('runWindows', () => {
  it('allows 01:59, 02:00 and 02:59 and refuses 03:01 (winter)', () => {
    for (const t of ['01:59', '02:00', '02:59']) expect(runWindows(utc(`2026-11-02T${t}:00Z`), cfg, false).refused).toBeNull();
    expect(runWindows(utc('2026-11-02T03:01:00Z'), cfg, false).refused).toMatch(/03:00/);
    expect(runWindows(utc('2026-11-02T03:00:00Z'), cfg, false).refused).not.toBeNull();
  });

  it('applies the cutoff in BST (summer) by London time, not UTC', () => {
    expect(runWindows(utc('2026-07-01T01:59:00Z'), cfg, false).refused).toBeNull(); // 02:59 BST
    expect(runWindows(utc('2026-07-01T02:01:00Z'), cfg, false).refused).not.toBeNull(); // 03:01 BST
  });

  it('sets 05:15 and 06:30 London on the last Sunday of March (spring forward)', () => {
    const w = runWindows(utc('2027-03-28T01:00:00Z'), cfg, false); // 02:00 BST
    expect(w).toEqual({ date: '2027-03-28', sunday: true, refused: null, noNewPhaseAt: sec('2027-03-28T04:15:00Z'), hardDeadlineAt: sec('2027-03-28T05:30:00Z') });
  });

  it('sets 05:15 and 06:30 London on the last Sunday of October (fall back)', () => {
    const w = runWindows(utc('2026-10-25T02:00:00Z'), cfg, false); // 02:00 GMT, after the repeated hour
    expect(w).toEqual({ date: '2026-10-25', sunday: true, refused: null, noNewPhaseAt: sec('2026-10-25T05:15:00Z'), hardDeadlineAt: sec('2026-10-25T06:30:00Z') });
    // 01:59 GMT on that day is the second 01:59 local: still before the cutoff, same limits.
    expect(runWindows(utc('2026-10-25T01:59:00Z'), cfg, false).hardDeadlineAt).toBe(sec('2026-10-25T06:30:00Z'));
  });

  it('flags Sundays by London date', () => {
    expect(runWindows(utc('2026-10-31T23:30:00Z'), cfg, false)).toMatchObject({ date: '2026-10-31', sunday: false });
    expect(runWindows(utc('2026-11-01T00:30:00Z'), cfg, false)).toMatchObject({ date: '2026-11-01', sunday: true });
  });

  it('gives a manual run no cutoff and limits at start +3h15 / +4h30', () => {
    const start = utc('2026-11-02T14:07:00Z');
    const w = runWindows(start, cfg, true);
    expect(w.refused).toBeNull();
    expect(w.noNewPhaseAt).toBe(start / 1000 + 3 * 3600 + 15 * 60);
    expect(w.hardDeadlineAt).toBe(start / 1000 + 4 * 3600 + 30 * 60);
  });
});

describe('config', () => {
  it('parses KEY=value lines, skips comments and expands $HOME', () => {
    expect(parseConfig('# c\nA=1\n\nB=$HOME/x\nC=${HOME}/y\nD="q"\n', { HOME: '/h' })).toEqual({ A: '1', B: '/h/x', C: '/h/y', D: 'q' });
    expect(() => parseConfig('A = 1')).toThrow();
  });

  it('has every key the harness scripts read', () => {
    const c = readConfig();
    for (const k of ['TZ_NAME', 'START_AT', 'START_CUTOFF', 'NO_NEW_PHASE_AFTER', 'HARD_DEADLINE', 'MIN_FREE_DISK_GB', 'MAX_OPEN_DAILY_PRS',
      'MODEL_IDEATE', 'MODEL_BUILD', 'MODEL_JUDGE', 'MAX_TURNS_IDEATE', 'MAX_TURNS_BUILD', 'MAX_TURNS_RETRY', 'WALL_IDEATE_MIN', 'WALL_BUILD_MIN',
      'WALL_RETRY_MIN', 'MAX_RETRIES', 'MAX_BUDGET_USD', 'GATE_CAP_MIN', 'BOT_SEEDS', 'PROXY_ALLOW', 'DAILY_HOME', 'TOKEN_FILE', 'BRANCH_KEEP_DAYS']) {
      expect(c[k], k).toBeTruthy();
    }
  });
});
