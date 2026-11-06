// A lap that beats the track's stored best: the HUD just after it, with the NEW BEST chip out under
// BEST, and the results screen of a race that set one, its chip reading NEW BEST LAP.
import { racer, raceStage, stageTrack, type StageFile } from './stage.ts';
import type { RacerView } from '../../sim/index.ts';

/** The stored best before these races: 0:41.20. A 2422-tick lap (0:40.37) beats it. */
const STORED_BEST_MS = 41200;

/** A finished racer: a 2510-tick opening lap, then 2422 (the new best), then 2466s. */
function finished(position: number, extra: number): RacerView {
  const { laps } = stageTrack();
  const lapTicks = Array.from({ length: laps }, (_, i) => (i === 0 ? 2510 + extra : i === 1 ? 2422 : 2466));
  return racer(position, laps, lapTicks, lapTicks.reduce((a, b) => a + b, 0));
}

export default {
  hud(root) {
    const { laps } = stageTrack();
    raceStage(root, {
      phase: 'racing',
      countdown: 0,
      // 30 ticks (0.5 s) after a 2422-tick first lap.
      raceTick: 2452,
      racers: [racer(2, laps, [2422]), racer(1, laps, [2380]), racer(3, laps, [2471]), racer(4, laps, [2502])],
      at: [0.02, 0.06, 0.99, 0.97],
      storedBestMs: STORED_BEST_MS,
    });
  },
  results(root) {
    const player = finished(2, 0);
    raceStage(root, {
      phase: 'finished',
      countdown: 0,
      raceTick: player.finishTick ?? 0,
      racers: [player, finished(1, -96), finished(3, 61), finished(4, 135)],
      at: [0.01, 0.03, 0.99, 0.97],
      storedBestMs: STORED_BEST_MS,
    });
  },
} satisfies StageFile;
