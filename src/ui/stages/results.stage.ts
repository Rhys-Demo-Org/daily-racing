// The results screen: a two-car race the player won, a six-car podium with the player third, and a
// long eight-car list with the player sixth and the last two still racing.
import { racer, raceStage, type StageFile } from './stage.ts';
import type { RacerView } from '../../sim/index.ts';

const finished = (position: number, finishTick: number): RacerView => racer(position, 3, [finishTick - 4830, 2410, 2420], finishTick);

export default {
  win(root) {
    raceStage(root, { phase: 'finished', countdown: 0, raceTick: 7311, racers: [finished(1, 7311), racer(2, 3, [2460, 2455])], at: [0.01, 0.93] });
  },
  podium(root) {
    raceStage(root, {
      phase: 'finished',
      countdown: 0,
      raceTick: 7402,
      racers: [finished(3, 7402), finished(1, 7290), finished(2, 7355), finished(4, 7461), finished(5, 7533), finished(6, 7690)],
      at: [0.01, 0.03, 0.02, 0.99, 0.98, 0.96],
    });
  },
  'long-list'(root) {
    raceStage(root, {
      phase: 'finished',
      countdown: 0,
      raceTick: 7550,
      racers: [
        finished(6, 7550),
        finished(1, 7290),
        finished(2, 7355),
        finished(3, 7402),
        finished(4, 7461),
        finished(5, 7533),
        racer(7, 3, [2470, 2466]),
        racer(8, 3, [2512, 2530]),
      ],
      at: [0.01, 0.06, 0.05, 0.04, 0.03, 0.02, 0.97, 0.9],
    });
  },
} satisfies StageFile;
