// Dust Bowl, reworked: the same oval-with-a-kink layout and ramp, scaled down so the turns are
// tight for the car's speed (it is no longer flat out), and widened so three cars fit abreast.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTrack } from '../../src/content/tracks.ts';
import { CAR_WIDTH, COUNTDOWN_TICKS, SURFACES, createBot, createWorld, stepWorld, validateTrack } from '../../src/sim/index.ts';
import { BOT_TUNING } from '../../src/sim/bot.ts';
import { forwardSpeed } from '../../src/sim/car.ts';
import { runBotRace } from '../sim/helpers.ts';

const TOP = SURFACES.dirt.topSpeed;

/** Share of car 0's flying-lap ticks (laps 2 and 3) the bot spends below 88% of top speed,
 * lifting or braking below 90% of it, and with more than 0.3 steering lock. */
function flyingLapShares(seed: number): { slow: number; lifting: number; steering: number } {
  const world = createWorld(getTrack('dust-bowl'), { seed, carCount: 1 });
  const bot = createBot(world, 0);
  let ticks = 0;
  let slow = 0;
  let lifting = 0;
  let steering = 0;
  for (let t = 0; t < 60 * 240 && world.racers[0]!.finishTick === null; t++) {
    const input = bot.input(world);
    if (world.tick >= COUNTDOWN_TICKS && world.racers[0]!.lapsCompleted >= 1) {
      const speed = forwardSpeed(world.cars[0]!);
      ticks++;
      if (speed < 0.88 * TOP) slow++;
      if ((!input.throttle || input.brake) && speed < 0.9 * TOP) lifting++;
      if (Math.abs(input.steer) > 0.3) steering++;
    }
    stepWorld(world, [input]);
  }
  return { slow: slow / ticks, lifting: lifting / ticks, steering: steering / ticks };
}

describe('Dust Bowl, tighter', () => {
  it('validates and keeps its id, name, 3 laps and its 5 × 1.0 ramp', () => {
    const raw: unknown = JSON.parse(readFileSync('src/content/tracks/dust-bowl.json', 'utf8'));
    const track = validateTrack(raw);
    expect(track.id).toBe('dust-bowl');
    expect(track.name).toBe('Dust Bowl');
    expect(track.laps).toBe(3);
    expect(track.ramps).toEqual([{ at: 0.09, length: 5, height: 1.0 }]);
    expect(track.centreline).toHaveLength(16);
  });

  it('AC1: is wide enough for three cars abreast with half a car width of room around each', () => {
    const { width } = getTrack('dust-bowl');
    expect(width).toBeGreaterThanOrEqual(3 * CAR_WIDTH + 4 * (CAR_WIDTH / 2) - 1e-9);
  });

  for (const seed of [1, 2, 3]) {
    it(`AC2: is a short lap: 350-450 units, each bot lap 15-20 s (seed ${seed})`, () => {
      const { world, lapSeconds, finished, seen } = runBotRace(getTrack('dust-bowl'), seed, 1);
      expect(world.track.length).toBeGreaterThan(350);
      expect(world.track.length).toBeLessThan(450);
      expect(finished).toBe(true);
      for (const lap of lapSeconds[0]!) {
        expect(lap).toBeGreaterThan(15);
        expect(lap).toBeLessThan(20);
      }
      expect(seen.grassTicks).toBe(0);
      expect(seen.propTicks).toBe(0);
    });

    it(`AC3: is not flat out: the bot slows, lifts and steers hard for a real share of a lap (seed ${seed})`, () => {
      const share = flyingLapShares(seed);
      expect(share.slow).toBeGreaterThan(0.1);
      expect(share.lifting).toBeGreaterThan(0.05);
      expect(share.steering).toBeGreaterThan(0.2);
    });
  }

  it('every grid slot of a 1-4 car race starts on the dirt, clear of every prop', () => {
    for (let cars = 1; cars <= 4; cars++) {
      for (let seed = 1; seed <= 20; seed++) {
        const world = createWorld(getTrack('dust-bowl'), { seed, carCount: cars });
        for (const car of world.cars) {
          expect(car.surface).toBe('dirt');
          expect(Math.abs(car.pos.lateral) + CAR_WIDTH / 2).toBeLessThan(world.track.halfWidth);
          for (const c of world.track.colliders) expect(Math.hypot(c.x - car.x, c.z - car.z) - c.bound).toBeGreaterThan(3);
        }
      }
    }
  });

  for (const cars of [2, 4]) {
    it(`${cars}-car bot races finish on seeds 1-20, never stuck`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const { finished, seen } = runBotRace(getTrack('dust-bowl'), seed, cars);
        expect(finished).toBe(true);
        expect(seen.maxSlowTicks).toBeLessThan(BOT_TUNING.stuckTicks);
        expect(seen.reversals).toBe(0);
      }
    });
  }
});
