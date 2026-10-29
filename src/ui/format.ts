// Text formatting for HUD and menus (UI_RULES §4: times are m:ss.cc, position is "2/6").

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

/** Race position as "x/n", e.g. "2/6". */
export function formatPosition(position: number, carCount: number): string {
  return `${position}/${carCount}`;
}
