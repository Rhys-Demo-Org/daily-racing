// Prints a bot's input sequence for car 0 in a two-car Dust Bowl race as JSON (throwaway spike).
// Car 1 is the game's bot, so playing these inputs through the driver reproduces this race.
//   node spikes/m2-game/inputs.ts <seed> <ticks>
import { dustBowl } from '../../tests/sim/helpers.ts';
import { createBot, createWorld, stepWorld, type CarInput } from '../../src/sim/index.ts';

const seed = Number(process.argv[2] ?? 1);
const ticks = Number(process.argv[3] ?? 3000);
const world = createWorld(dustBowl, { seed, carCount: 2 });
const bots = [createBot(world, 0), createBot(world, 1)];
const inputs: CarInput[] = [];
for (let i = 0; i < ticks; i++) {
  const frame = bots.map((b) => b.input(world));
  inputs.push(frame[0] as CarInput);
  stepWorld(world, frame);
}
console.log(JSON.stringify(inputs));
