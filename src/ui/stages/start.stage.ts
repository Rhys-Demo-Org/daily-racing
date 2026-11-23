// The menu (S6): the title panel and track select as the game first shows it, with stored bests
// for two tracks and none for the rest and Pine Ridge locked; with a later track selected; and with
// Pine Ridge unlocked by a Hay Loop finish.
import { TRACKS, TRACK_LOCKS, isTrackLocked } from '../../content/tracks.ts';
import { trackLayout } from '../../sim/index.ts';
import { memoryBestLaps } from '../best-laps.ts';
import { createStartScreen } from '../start-screen.ts';
import type { TrackCardView, TrackLocked } from '../types.ts';
import { menuLayer, type StageFile } from './stage.ts';

/** Every registered track as the game passes it to the menu (every 8th centreline point). */
export function stageTrackCards(): TrackCardView[] {
  return TRACKS.map((t) => ({ id: t.id, name: t.name, outline: trackLayout(t).centre.filter((_, i) => i % 8 === 0) }));
}

/** Stored bests for the first two tracks (0:40.37 and 0:52.10). */
const bests = (): ReturnType<typeof memoryBestLaps> =>
  memoryBestLaps(Object.fromEntries(TRACKS.slice(0, 2).map((t, i) => [t.id, i === 0 ? 40370 : 52100])));

/** Locks as the game reads them, from a fixed set of finished tracks instead of storage. */
const locks = (finished: readonly string[]): TrackLocked => (id) => isTrackLocked(id, (t) => finished.includes(t));

export default {
  menu(root) {
    createStartScreen(menuLayer(root), { onRace: () => {}, tracks: stageTrackCards(), bestLaps: bests(), locked: locks([]) }).show();
  },
  'menu-unlocked'(root) {
    const finished = Object.values(TRACK_LOCKS).map((l) => l.afterFinishOn);
    createStartScreen(menuLayer(root), { onRace: () => {}, tracks: stageTrackCards(), bestLaps: bests(), locked: locks(finished) }).show();
  },
  'menu-selected'(root) {
    const screen = createStartScreen(menuLayer(root), { onRace: () => {}, tracks: stageTrackCards(), bestLaps: bests(), locked: locks([]) });
    const last = TRACKS[TRACKS.length - 1];
    if (last) screen.select(last.id);
    screen.show();
  },
} satisfies StageFile;
