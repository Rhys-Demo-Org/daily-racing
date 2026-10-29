// Prints the test autopilot's input sequence for one Dust Bowl lap as JSON (throwaway spike).
//   node spikes/m2-game/inputs.ts <seed> <ticks>
import { autopilot, dustBowl } from '../../tests/sim/helpers.ts';
import { createWorld, stepWorld, type CarInput } from '../../src/sim/index.ts';

const seed = Number(process.argv[2] ?? 1);
const ticks = Number(process.argv[3] ?? 3000);
const world = createWorld(dustBowl, { seed, carCount: 1 });
const inputs: CarInput[] = [];
for (let i = 0; i < ticks; i++) {
  const input = autopilot(world);
  inputs.push(input);
  stepWorld(world, [input]);
}
console.log(JSON.stringify(inputs));
