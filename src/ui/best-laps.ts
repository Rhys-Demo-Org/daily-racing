// Best lap per track, kept in localStorage so it outlives the page. Storage can be missing or
// blocked (private tabs, sandboxed frames), so every access is wrapped: a failure reads as "no best"
// and a write that fails is dropped.

/** The localStorage key holding a track's best lap in ms. B08/B11 read the same key. */
export function bestLapKey(trackId: string): string {
  return `racer.bestLap.${trackId}`;
}

/** Where best laps are kept: localStorage in the game, an in-memory map in stages. */
export interface BestLapStore {
  /** The stored best lap in ms, or null if there is none (or it can't be read or isn't a positive number). */
  read(trackId: string): number | null;
  write(trackId: string, ms: number): void;
}

/** Parses a stored value; anything but a positive finite number counts as no best. */
function parse(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const ms = Number(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** Best laps in window.localStorage. */
export const localBestLaps: BestLapStore = {
  read(trackId) {
    try {
      return parse(window.localStorage.getItem(bestLapKey(trackId)));
    } catch {
      return null;
    }
  },
  write(trackId, ms) {
    try {
      window.localStorage.setItem(bestLapKey(trackId), String(ms));
    } catch {
      // Storage blocked or full: the best lap just isn't kept.
    }
  },
};

/** Best laps in memory, starting from `initial` (track id → ms). */
export function memoryBestLaps(initial: Readonly<Record<string, number>> = {}): BestLapStore {
  const laps = new Map(Object.entries(initial));
  return {
    read: (trackId) => parse(laps.get(trackId)?.toString()),
    write: (trackId, ms) => void laps.set(trackId, ms),
  };
}
