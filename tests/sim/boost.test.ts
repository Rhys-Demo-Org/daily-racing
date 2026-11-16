// B12 boost: firing a collected pickup (AC4), and tracks without pickups unchanged (AC5).
import { describe, expect, it } from 'vitest';
import { carViews, createBot, createWorld, raceView, stepWorld, type CarInput, type CarView, type RaceView, type TrackData } from '../../src/sim/index.ts';
import { dustBowl, TRACKS } from './helpers.ts';

const bends = TRACKS.find((t) => t.name === 'Bramble Bends') as TrackData;

interface Tick {
  car: CarView;
  view: RaceView;
}

/**
 * Car 0 alone on Dust Bowl at full throttle, steered by its bot. `fire(car, view)` decides whether
 * this tick's input carries `action: true`. Returns the state after every tick and the fired ticks.
 */
function drive(ticks: number, fire: (car: CarView, view: RaceView) => boolean): { log: Tick[]; fired: number[] } {
  const world = createWorld(dustBowl, { seed: 4, carCount: 1 });
  const bot = createBot(world, 0);
  const log: Tick[] = [];
  const fired: number[] = [];
  for (let t = 0; t < ticks; t++) {
    const input: CarInput = { steer: bot.input(world).steer, throttle: true, brake: false };
    if (fire(carViews(world)[0] as CarView, raceView(world))) {
      input.action = true;
      fired.push(t);
    }
    stepWorld(world, [input]);
    log.push({ car: carViews(world)[0] as CarView, view: raceView(world) });
  }
  return { log, fired };
}

describe('B12 boost', () => {
  it('AC4: one action tick while armed at speed on a straight: boostTicks 90 → 0, faster than 25, never above 32, then back to ≤ 25.5', () => {
    let done = false;
    // Fire once, armed, at ≥ 24 on dirt on the long northern straight (heading west).
    const { log, fired } = drive(1200, (car, view) => {
      const go = !done && view.racers[0]?.armed === true && car.speed >= 24 && car.surface === 'dirt' && !car.airborne && car.z < -25 && car.x < 60 && car.x > 40;
      done ||= go;
      return go;
    });
    expect(fired).toHaveLength(1);
    const f = fired[0] as number;
    expect((log[f - 1] as Tick).view.racers[0]?.armed).toBe(true);
    const before = (log[f - 1] as Tick).car.speed;
    expect(before).toBeGreaterThanOrEqual(24);
    expect(before).toBeLessThanOrEqual(25);

    const first = log[f] as Tick;
    expect(first.view.racers[0]?.armed).toBe(false);
    expect(first.view.racers[0]?.boostTicks).toBe(90);
    let top = 0;
    for (let k = 0; k <= 90; k++) {
      const t = log[f + k] as Tick;
      expect(t.view.racers[0]?.boostTicks, `tick ${k}`).toBe(90 - k);
      expect(t.car.speed, `tick ${k}`).toBeLessThanOrEqual(32);
      top = Math.max(top, t.car.speed);
    }
    expect(top).toBeGreaterThan(25);
    for (let k = 91; k <= 400; k++) expect((log[f + k] as Tick).view.racers[0]?.boostTicks).toBe(0);
    const settled = Array.from({ length: 120 }, (_, k) => (log[f + 90 + k] as Tick).car.speed).findIndex((s) => s <= 25.5);
    expect(settled).toBeGreaterThanOrEqual(0);
    expect(settled).toBeLessThan(120);
  });

  it('AC4: action while not armed changes nothing compared with the same run without it', () => {
    let armed = -1;
    const withAction = drive(700, (_, view) => {
      if (armed < 0 && view.racers[0]?.armed) armed = view.raceTick;
      return armed < 0;
    });
    expect(armed).toBeGreaterThan(0);
    const without = drive(700, () => false);
    // Identical up to and including the tick that armed the player (action came before it each tick).
    const upTo = withAction.fired.length;
    expect(upTo).toBeGreaterThan(200);
    for (let t = 0; t < upTo; t++) {
      expect(withAction.log[t]?.car).toEqual(without.log[t]?.car);
      expect(withAction.log[t]?.view).toEqual(without.log[t]?.view);
    }
    expect(withAction.log[upTo - 1]?.view.racers[0]?.armed).toBe(true);
    expect(withAction.log[upTo - 1]?.view.racers[0]?.boostTicks).toBe(0);
  });
});

describe('B12 tracks without pickups', () => {
  it('AC5: on Bramble Bends, action every tick gives identical car and race views; no pickup keys anywhere', () => {
    const plain = createWorld(bends, { seed: 6, carCount: 3 });
    const pressed = createWorld(bends, { seed: 6, carCount: 3 });
    const botsA = plain.cars.map((_, i) => createBot(plain, i));
    const botsB = pressed.cars.map((_, i) => createBot(pressed, i));
    for (let t = 0; t < 1500; t++) {
      stepWorld(plain, botsA.map((b) => b.input(plain)));
      stepWorld(pressed, botsB.map((b) => ({ ...b.input(pressed), action: true })));
      expect(carViews(pressed)).toEqual(carViews(plain));
      const view = raceView(pressed);
      expect(view).toEqual(raceView(plain));
      expect('pickups' in view).toBe(false);
      for (const r of view.racers) {
        expect('armed' in r).toBe(false);
        expect('boostTicks' in r).toBe(false);
      }
    }
    // Unlike a pickup track, whose views carry them from the start.
    const dust = raceView(createWorld(dustBowl, { seed: 6, carCount: 3 }));
    expect(dust.pickups?.length).toBeGreaterThan(0);
    expect(dust.racers.every((r) => 'armed' in r && 'boostTicks' in r)).toBe(true);
  });
});
