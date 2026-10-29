// Gate 2 measure step: two bots (as in the game) race every registered track once per seed, using
// the tree's own sim. Prints every car's position after every tick; the verdict judges laps,
// stuck and teleports from that trajectory with main's code. Runs under
// `node --permission --allow-fs-read=<tree>` in a measure container.
//
//   node guardrails/gates/g2-measure.ts <tree> <seed,seed,...>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackData } from '../../src/sim/index.ts';
import { createBot, createWorld, stepWorld } from '../../src/sim/index.ts';
import { emit, jsonFiles } from './lib.ts';

/** Cars per race, as in the game (player slot + one opponent, both bot-driven here). */
const CARS = 2;
/** Give up after this many ticks (5 minutes of sim time, countdown included). */
const TICK_CAP = 60 * 300;

export interface G2Race {
  seed: number;
  /** Per car: x and z after each tick, index 0 = the grid before the first tick. */
  cars: { x: number[]; z: number[] }[];
}

export interface G2Measure {
  seeds: number[];
  tracks: { file: string; data: unknown; races: G2Race[]; error?: string }[];
}

function race(data: TrackData, seed: number): G2Race {
  const world = createWorld(data, { seed, carCount: CARS });
  const bots = world.cars.map((_, i) => createBot(world, i));
  const cars = world.cars.map((c) => ({ x: [c.x], z: [c.z] }));
  for (let t = 0; t < TICK_CAP && world.racers.some((r) => r.finishTick === null); t++) {
    stepWorld(world, bots.map((b) => b.input(world)));
    world.cars.forEach((c, i) => {
      cars[i]!.x.push(c.x);
      cars[i]!.z.push(c.z);
    });
  }
  return { seed, cars };
}

const [root = process.cwd(), seedList = ''] = process.argv.slice(2);
const seeds = seedList.split(',').filter(Boolean).map(Number);
const dir = join(root, 'src', 'content', 'tracks');
const tracks = jsonFiles(dir).map((file) => {
  let data: unknown = null;
  try {
    data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    return { file, data, races: seeds.map((seed) => race(data as TrackData, seed)) };
  } catch (e) {
    return { file, data, races: [], error: String(e) };
  }
});
emit({ seeds, tracks } satisfies G2Measure);
