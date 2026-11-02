// Text formatting for HUD and menus (UI_RULES §4: times are m:ss.cc, position is "2/6").
import { TICK_HZ } from '../sim/types.ts';

/** Sim ticks to ms. */
export const ticksToMs = (ticks: number): number => (ticks * 1000) / TICK_HZ;

/** Shown where a time does not exist yet (e.g. no best lap). En dashes, same width as digits. */
export const NO_TIME = '–:––.––';

/**
 * Formats a duration in ms as m:ss.cc, rounded to the nearest centisecond.
 * Minutes are not padded and not capped (10 minutes is "10:00.00"). Negative values clamp to 0.
 */
export function formatTime(ms: number): string {
  const cs = Math.max(0, Math.round(ms / 10));
  const minutes = Math.floor(cs / 6000);
  const seconds = Math.floor((cs % 6000) / 100);
  const centis = cs % 100;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

/** Formats a time that may be missing; null gives NO_TIME. */
export function formatOptionalTime(ms: number | null): string {
  return ms === null ? NO_TIME : formatTime(ms);
}

/** A placing as caps ordinal: 1 → "1ST", 2 → "2ND", 11 → "11TH", 22 → "22ND". */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'TH' : (['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH');
  return `${n}${suffix}`;
}

/** A gap behind the leader in ms: "+s.cc" under a minute, "+m:ss.cc" from a minute on. */
export function formatGap(ms: number): string {
  return `+${formatTime(ms).replace(/^0:0?/, '')}`;
}
