// The countdown over the HUD: the first beat (3) and the GO! stamp just after the start.
import { racer, raceStage, type StageFile } from './stage.ts';

const grid = [0.995, 0.99];

export default {
  three(root) {
    raceStage(root, { phase: 'countdown', countdown: 3, raceTick: 0, racers: [racer(1, 3, []), racer(2, 3, [])], at: grid });
  },
  go(root) {
    raceStage(root, { phase: 'racing', countdown: 0, raceTick: 12, racers: [racer(2, 3, []), racer(1, 3, [])], at: [0.002, 0.004] });
  },
} satisfies StageFile;
