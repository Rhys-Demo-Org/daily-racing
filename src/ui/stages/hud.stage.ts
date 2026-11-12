// The race HUD mid-race: lap 2 of 3, P2 of 6, a best lap set, the touch controls awake. And lap 1
// just after GO, when a desktop also shows the keycap legend bottom-left.
import { racer, raceStage, type StageFile } from './stage.ts';

export default {
  'mid-race'(root) {
    raceStage(root, {
      phase: 'racing',
      countdown: 0,
      raceTick: 4210,
      racers: [
        racer(2, 3, [2422]),
        racer(1, 3, [2380]),
        racer(3, 3, [2471]),
        racer(4, 3, [2502]),
        racer(5, 3, [2533]),
        racer(6, 3, []),
      ],
      at: [0.71, 0.74, 0.66, 0.6, 0.52, 0.31],
    });
  },
  'first-lap'(root) {
    raceStage(root, {
      phase: 'racing',
      countdown: 0,
      raceTick: 1460,
      racers: [racer(3, 3, []), racer(1, 3, []), racer(2, 3, []), racer(4, 3, []), racer(5, 3, []), racer(6, 3, [])],
      at: [0.52, 0.6, 0.56, 0.47, 0.42, 0.36],
    });
  },
} satisfies StageFile;
