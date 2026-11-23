// Test-only helpers for the B13 rival pickup suites: six-car races logged tick by tick.
import { carViews, createBot, createWorld, raceView, stepWorld } from '../../src/sim/index.ts';
import type { CarInput, CarView, PickupInstance, RaceView, TrackData, World } from '../../src/sim/index.ts';

export interface Tick {
  /** Inputs fed to stepWorld this tick. */
  inputs: CarInput[];
  /** Views before and after the step. */
  before: RaceView;
  view: RaceView;
  cars: CarView[];
}

/**
 * A race on `track` with every car driven by createBot(world, i), unless `override(world, i, botInput, t)`
 * returns another input for car i. Runs `ticks` ticks, or until every car has finished.
 */
export function race(
  track: TrackData,
  seed: number,
  ticks: number,
  override?: (world: World, car: number, bot: CarInput, t: number) => CarInput,
  carCount = 6,
): { world: World; log: Tick[] } {
  const world = createWorld(track, { seed, carCount });
  const bots = world.cars.map((_, i) => createBot(world, i));
  const log: Tick[] = [];
  for (let t = 0; t < ticks; t++) {
    const before = raceView(world);
    const inputs = bots.map((b, i) => {
      const input = { ...b.input(world) };
      return override ? override(world, i, input, t) : input;
    });
    stepWorld(world, inputs);
    const view = raceView(world);
    log.push({ inputs, before, view, cars: carViews(world) });
    if (view.racers.every((r) => r.finishTick !== null)) break;
  }
  return { world, log };
}

export function near(p: PickupInstance, c: CarView, r = 2.5): boolean {
  return (p.x - c.x) ** 2 + (p.z - c.z) ** 2 <= r * r;
}

/** Ticks where an AI car (index ≥ 1) turned armed, with the box it took (present → absent within 2.5). */
export function aiTakes(log: readonly Tick[], boxes: readonly PickupInstance[]): { t: number; car: number; box: number }[] {
  const out: { t: number; car: number; box: number }[] = [];
  log.forEach(({ before, view, cars }, t) => {
    for (let i = 1; i < view.racers.length; i++) {
      if (before.racers[i]?.armed !== false || view.racers[i]?.armed !== true) continue;
      const box = boxes.findIndex((p, b) => before.pickups?.[b] === true && view.pickups?.[b] === false && near(p, cars[i] as CarView));
      out.push({ t, car: i, box });
    }
  });
  return out;
}

/** AI boosts: the tick an AI car's input carried action while it was armed. */
export function aiFires(log: readonly Tick[]): { t: number; car: number }[] {
  const out: { t: number; car: number }[] = [];
  log.forEach(({ inputs, before }, t) => {
    for (let i = 1; i < inputs.length; i++) if (inputs[i]?.action === true && before.racers[i]?.armed === true) out.push({ t, car: i });
  });
  return out;
}
