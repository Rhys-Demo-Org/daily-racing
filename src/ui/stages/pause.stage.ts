// The pause card over the frozen race: lap 2 of 3 at 1:10.17.
import { racer, raceStage, type StageFile } from './stage.ts';

export default {
  paused(root) {
    raceStage(root, {
      phase: 'racing',
      countdown: 0,
      raceTick: 4210,
      racers: [racer(1, 3, [2422]), racer(2, 3, [2480])],
      at: [0.71, 0.66],
    }).pause();
  },
} satisfies StageFile;
