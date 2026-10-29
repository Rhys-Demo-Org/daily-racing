// London time windows for the nightly run (HANDOVER §6.1), computed with Intl so DST days are
// right: the start cutoff, the "no new phase" time and the hard deadline as epoch seconds.

/** Date (YYYY-MM-DD), minutes since local midnight and weekday (0 = Sunday) of `ms` in `tz`. */
export function zonedParts(ms: number, tz: string): { date: string; minutes: number; weekday: number } {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(ms).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, minutes: Number(p.hour) * 60 + Number(p.minute), weekday: new Date(`${date}T00:00:00Z`).getUTCDay() };
}

/** Minutes since midnight of an `HH:MM` string. */
function hhmm(s: string): number {
  const m = /^(\d\d):(\d\d)$/.exec(s);
  if (!m) throw new Error(`bad time "${s}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Epoch ms of local `time` (HH:MM) on `date` in `tz`. Times in a spring-forward gap resolve forward. */
export function zonedTime(date: string, time: string, tz: string): number {
  const t = hhmm(time);
  const guess = Date.parse(`${date}T00:00:00Z`) + t * 60_000;
  const offset = (ms: number): number => {
    const p = zonedParts(ms, tz);
    return Date.parse(`${p.date}T00:00:00Z`) + p.minutes * 60_000 - ms;
  };
  const first = guess - offset(guess);
  return guess - offset(first);
}


type WindowConfig = { tz: string; startAt: string; startCutoff: string; noNewPhaseAfter: string; hardDeadline: string };

/** What the run may do, all instants in epoch seconds. `refused` is null when the run may start. */
export type Windows = { date: string; sunday: boolean; refused: string | null; noNewPhaseAt: number; hardDeadlineAt: number };

/**
 * Windows for a run starting at `nowMs`. Nightly: refused after the cutoff minute (03:00 itself
 * still starts: on spring-forward day systemd may fire the 02:00 timer at 03:00 BST), limits are
 * the configured London times on the run's date. Manual (owner, daytime): no cutoff, limits are
 * the start plus the same offsets the nightly limits have from START_AT (05:15 → +3h15, 06:30 → +4h30).
 */
export function runWindows(nowMs: number, c: WindowConfig, manual: boolean): Windows {
  const p = zonedParts(nowMs, c.tz);
  const at = (time: string): number =>
    Math.floor((manual ? nowMs + (hhmm(time) - hhmm(c.startAt)) * 60_000 : zonedTime(p.date, time, c.tz)) / 1000);
  const late = !manual && p.minutes > hhmm(c.startCutoff);
  return {
    date: p.date,
    sunday: p.weekday === 0,
    refused: late ? `after the ${c.startCutoff} ${c.tz} start cutoff` : null,
    noNewPhaseAt: at(c.noNewPhaseAfter),
    hardDeadlineAt: at(c.hardDeadline),
  };
}
