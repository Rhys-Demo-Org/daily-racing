// Track select (S6) with more cards than the phone's row holds (UI_RULES §12): the four registered
// tracks plus four fixture tracks (the registered outlines mirrored), Pine Ridge locked as the game
// first shows it. At 844×390 the cards sit at their 96px minimum and the row scrolls, the next card
// peeking in at its edge, with RACE fixed below.
import { TRACKS, isTrackLocked } from '../../content/tracks.ts';
import { memoryBestLaps } from '../best-laps.ts';
import { createStartScreen } from '../start-screen.ts';
import type { TrackCardView } from '../types.ts';
import { menuLayer, type StageFile } from './stage.ts';
import { stageTrackCards } from './start.stage.ts';

const FIXTURE_NAMES = ['Quarry Run', 'Mill Lane', 'Old Ford', 'Long Field'];

/** Eight cards: the registered tracks, then fixture tracks with the same outlines mirrored. */
function manyCards(): TrackCardView[] {
  const real = stageTrackCards();
  const fixtures = FIXTURE_NAMES.map((name, i) => {
    const source = real[i % real.length];
    const outline = (source?.outline ?? []).map(([x, z]): [number, number] => [-x, z]);
    return { id: `fixture-${i + 1}`, name, outline };
  });
  return [...real, ...fixtures];
}

/** A stored best for the first track (0:40.37). */
const bests = (): ReturnType<typeof memoryBestLaps> => memoryBestLaps(Object.fromEntries(TRACKS.slice(0, 1).map((t) => [t.id, 40370])));

export default {
  'many-cards'(root) {
    createStartScreen(menuLayer(root), {
      onRace: () => {},
      tracks: manyCards(),
      bestLaps: bests(),
      locked: (id) => isTrackLocked(id, () => false),
    }).show();
  },
} satisfies StageFile;
