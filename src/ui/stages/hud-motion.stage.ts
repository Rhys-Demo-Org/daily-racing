// HUD event motion (board 05 #3, #9) frozen on the frame that starts each move: an overtake (P3 → P2,
// the POS panel bumps and its digit rolls), a new lap (1/3 → 2/3, the LAP panel stamps), each again
// 9 ticks later on the move's last frame (synced every tick) and 10 ticks later once it is over, a
// second overtake 4 ticks after the first (P2 → P1, the move restarts), a steady race (nothing
// moves), the race entry at the countdown (panels and touch controls slide in) and a resume after GO
// (no entry), and a second race on the same UI (its first sync is no event). The touch controls take
// real pointer input, so a test can hold one down.
import { createTouchInput } from '../../input/touch.ts';
import type { RacerView } from '../../sim/index.ts';
import type { RaceUi } from '../race-ui.ts';
import { carColours, racer, raceStage, stageTrack, syncStage, type RaceSync, type StageFile } from './stage.ts';

/** A three-lap race, so a new lap reads 2/3. */
const LAPS = 3;
const at = [0.5, 0.52, 0.48, 0.45];
const racing = (raceTick: number, racers: RacerView[]): RaceSync => ({ phase: 'racing', countdown: 0, raceTick, racers, at });

/** Four cars on lap 1 (the player on lap 2 after a `lap1`-tick first lap), the player at `position`. */
function field(position: number, lap1: number | null = null): RacerView[] {
  const order = [position, ...[1, 2, 3, 4].filter((p) => p !== position)];
  return order.map((p, i) => racer(p, LAPS, i === 0 && lap1 !== null ? [lap1] : []));
}

/** The race UI after these syncs in order (the first right after reset), with touch input on the window. */
function race(root: HTMLElement, first: RaceSync, ...rest: RaceSync[]): RaceUi {
  const ui = raceStage(root, { ...first, laps: LAPS });
  for (const s of rest) syncStage(ui, s);
  createTouchInput(window, { zones: () => ui.touch.zones(), listener: ui.touch.machine });
  return ui;
}

const OVERTAKE: [RaceSync, RaceSync] = [racing(1200, field(3)), racing(1201, field(2))];
const NEW_LAP: [RaceSync, RaceSync] = [racing(2421, field(2)), racing(2422, field(2, 2422))];

/** One sync per tick from `from` to `to` inclusive, as the game syncs every frame. */
function everyTick(from: number, to: number, racers: RacerView[]): RaceSync[] {
  return Array.from({ length: to - from + 1 }, (_, i) => racing(from + i, racers));
}

export default {
  overtake(root) {
    race(root, ...OVERTAKE);
  },
  'overtake-done'(root) {
    race(root, ...OVERTAKE, racing(1211, field(2)));
  },
  'overtake-twice'(root) {
    race(root, ...OVERTAKE, racing(1205, field(1)));
  },
  'overtake-late'(root) {
    race(root, ...OVERTAKE, ...everyTick(1202, 1210, field(2)));
  },
  'new-lap'(root) {
    race(root, ...NEW_LAP);
  },
  'new-lap-done'(root) {
    race(root, ...NEW_LAP, racing(2432, field(2, 2422)));
  },
  'new-lap-late'(root) {
    race(root, ...NEW_LAP, ...everyTick(2423, 2431, field(2, 2422)));
  },
  steady(root) {
    race(root, racing(4210, field(2, 2422)));
  },
  'steady-twice'(root) {
    race(root, racing(4210, field(2, 2422)), racing(4211, field(2, 2422)));
  },
  entry(root) {
    race(root, { phase: 'countdown', countdown: 3, raceTick: 0, racers: field(4), at });
  },
  resumed(root) {
    const ui = race(root, { phase: 'countdown', countdown: 3, raceTick: 0, racers: field(4), at }, racing(600, field(4)));
    ui.pause();
    ui.resume();
  },
  'second-race'(root) {
    // The game keeps one race UI and resets it per race: race 2 starts from race 1's P2 on lap 2.
    const ui = race(root, ...OVERTAKE, ...NEW_LAP.slice(1));
    const track = stageTrack();
    ui.reset(LAPS, track.outline, carColours(4), { trackName: track.name, carNumbers: [1, 7, 11, 15] });
    syncStage(ui, racing(600, field(4, 300)));
  },
} satisfies StageFile;
