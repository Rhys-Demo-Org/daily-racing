// Screen changes held mid-sweep: the triple stripe over the menu it reveals (QUIT TO MENU), and
// the chequer band over the race it reveals (RACE, RETRY, NEXT RACE).
import { memoryBestLaps } from '../best-laps.ts';
import { createStartScreen } from '../start-screen.ts';
import { playScreenChange } from '../screen-change.ts';
import { stageTrackCards } from './start.stage.ts';
import { menuLayer, racer, raceStage, type StageFile } from './stage.ts';

export default {
  stripes(root) {
    createStartScreen(menuLayer(root), { onRace: () => {}, tracks: stageTrackCards(), bestLaps: memoryBestLaps() }).show();
    playScreenChange(root, 'stripes', true);
  },
  chequer(root) {
    raceStage(root, { phase: 'countdown', countdown: 3, raceTick: 0, racers: [racer(1, 3, []), racer(2, 3, [])], at: [0.995, 0.99] });
    playScreenChange(root, 'chequer', true);
  },
} satisfies StageFile;
