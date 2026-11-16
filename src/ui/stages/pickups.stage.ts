// A pickup track on lap 1 just after GO: the Boost button above GAS (touch) and SPACE · POWER-UP in
// the keycap legend (desktop). Unarmed it is a dirt roundel; holding a power-up it turns mustard.
import type { RacerView } from '../../sim/index.ts';
import { racer, raceStage, type StageFile } from './stage.ts';

const AT = [0.52, 0.6, 0.56, 0.47, 0.42, 0.36];

function pickupStage(root: HTMLElement, armed: boolean): void {
  const racers: RacerView[] = AT.map((_, i) => ({ ...racer(i === 0 ? 3 : i, 3, []), armed: i === 0 && armed, boostTicks: 0 }));
  raceStage(root, { phase: 'racing', countdown: 0, raceTick: 1460, racers, at: AT, pickups: [true, false, true] });
}

export default {
  armed(root) {
    pickupStage(root, true);
  },
  unarmed(root) {
    pickupStage(root, false);
  },
} satisfies StageFile;
