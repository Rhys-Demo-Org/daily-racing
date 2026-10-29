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
