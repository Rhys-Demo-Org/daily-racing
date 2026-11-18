// Track registry. Every src/content/tracks/*.json is registered by being there (import.meta.glob):
// there is no hand-edited index, so PRs that each add a track never conflict. Each file is
// validated and its id must equal its file name.
import { validateTrack, type TrackData } from '../sim/index.ts';

const files = import.meta.glob<unknown>('./tracks/*.json', { eager: true, import: 'default' });

function load(): TrackData[] {
  return Object.keys(files)
    .sort()
    .map((path) => {
      const track = validateTrack(files[path]);
      const fileId = path.slice('./tracks/'.length, -'.json'.length);
      if (track.id !== fileId) throw new Error(`Track ${path} has id "${track.id}"; it must equal the file name`);
      return track;
    });
}

/** All registered tracks, sorted by file name. */
export const TRACKS: readonly TrackData[] = load();

export function getTrack(id: string): TrackData {
  const track = TRACKS.find((t) => t.id === id);
  if (!track) throw new Error(`Unknown track "${id}"`);
  return track;
}

/** Tracks that start locked: each unlocks once the player has finished a race on `afterFinishOn`. */
export const TRACK_LOCKS: Readonly<Record<string, { afterFinishOn: string }>> = {
  'forest-ridge': { afterFinishOn: 'hay-loop' },
};

/** The localStorage key set once the player has finished a race on a track. */
export function finishedKey(trackId: string): string {
  return `racer.finished.${trackId}`;
}

/**
 * Whether the player has ever finished a race on `trackId`. Storage can be missing (plain Node) or
 * blocked (private tabs), so every access, `window` included, is wrapped: a failure reads as not finished.
 */
export function hasFinished(trackId: string): boolean {
  try {
    return window.localStorage.getItem(finishedKey(trackId)) !== null;
  } catch {
    return false;
  }
}

/** Records that the player finished a race on `trackId`; a write that fails is dropped. */
export function saveFinished(trackId: string): void {
  try {
    window.localStorage.setItem(finishedKey(trackId), '1');
  } catch {
    // Storage blocked or full: the finish just isn't kept.
  }
}

/** Whether `trackId` is still locked, reading finishes from `finished` (default: localStorage). */
export function isTrackLocked(trackId: string, finished: (trackId: string) => boolean = hasFinished): boolean {
  const lock = TRACK_LOCKS[trackId];
  return lock !== undefined && !finished(lock.afterFinishOn);
}

/**
 * The id of the track after `currentId` in `ids`, wrapping to the first. Without `ids` it walks the
 * registry and skips locked tracks (but never `currentId` itself).
 */
export function nextTrackId(currentId: string, ids?: readonly string[]): string {
  const order = ids ?? TRACKS.map((t) => t.id).filter((id) => id === currentId || !isTrackLocked(id));
  const i = order.indexOf(currentId);
  if (i < 0) throw new Error(`Unknown track "${currentId}"`);
  return order[(i + 1) % order.length] as string;
}
