// The menu (S6): the title panel and track select as the game first shows it, with stored bests
// for two tracks and none for the rest; and with a later track selected.
import { TRACKS } from '../../content/tracks.ts';
import { trackLayout } from '../../sim/index.ts';
import { memoryBestLaps } from '../best-laps.ts';
import { createStartScreen } from '../start-screen.ts';
import type { TrackCardView } from '../types.ts';
import { menuLayer, type StageFile } from './stage.ts';

/** Every registered track as the game passes it to the menu (every 8th centreline point). */
export function stageTrackCards(): TrackCardView[] {
  return TRACKS.map((t) => ({ id: t.id, name: t.name, outline: trackLayout(t).centre.filter((_, i) => i % 8 === 0) }));
}

/** Stored bests for the first two tracks (0:40.37 and 0:52.10). */
const bests = (): ReturnType<typeof memoryBestLaps> =>
  memoryBestLaps(Object.fromEntries(TRACKS.slice(0, 2).map((t, i) => [t.id, i === 0 ? 40370 : 52100])));

export default {
  menu(root) {
    createStartScreen(menuLayer(root), { onRace: () => {}, tracks: stageTrackCards(), bestLaps: bests() }).show();
  },
  'menu-selected'(root) {
    const screen = createStartScreen(menuLayer(root), { onRace: () => {}, tracks: stageTrackCards(), bestLaps: bests() });
    const last = TRACKS[TRACKS.length - 1];
    if (last) screen.select(last.id);
    screen.show();
  },
} satisfies StageFile;
