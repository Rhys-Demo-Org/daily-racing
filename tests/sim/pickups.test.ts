// B12 pickups: track data, layout, collecting and respawn (AC1–AC3), through the sim's public API.
import { describe, expect, it } from 'vitest';
import {
  carViews,
  createBot,
  createWorld,
  raceView,
  stepWorld,
  trackLayout,
  validateTrack,
  type CarInput,
  type RaceView,
  type TrackData,
  type World,
} from '../../src/sim/index.ts';
import { dustBowl, TRACKS } from './helpers.ts';

const byName = (name: string): TrackData => TRACKS.find((t) => t.name === name) as TrackData;
const near = (a: { x: number; z: number }, b: { x: number; z: number }, r: number): boolean => Math.hypot(a.x - b.x, a.z - b.z) <= r;

/** Runs `ticks` ticks; car 0 follows `player` (or its own bot) and every other car its bot. */
function run(world: World, ticks: number, each: (w: World) => void, player?: () => CarInput): void {
  const bots = world.cars.map((_, i) => createBot(world, i));
  for (let t = 0; t < ticks; t++) {
    stepWorld(world, bots.map((b, i) => (i === 0 && player ? player() : b.input(world))));
    each(world);
  }
}

describe('B12 pickups: track data', () => {
  it('AC1: validateTrack accepts optional pickups and rejects bad at/lateral, naming the field', () => {
    const t = structuredClone(dustBowl);
    t.pickups = [{ at: 0.5, lateral: t.width / 2 - 1 }];
    expect(validateTrack(t).pickups).toEqual([{ at: 0.5, lateral: t.width / 2 - 1 }]);
    for (const [bad, field] of [
      [{ at: 1, lateral: 0 }, /pickups\[1\]\.at/],
      [{ at: -0.01, lateral: 0 }, /pickups\[1\]\.at/],
      [{ at: 0.2, lateral: t.width / 2 - 0.9 }, /pickups\[1\]\.lateral/],
      [{ at: 0.2, lateral: -(t.width / 2 - 0.9) }, /pickups\[1\]\.lateral/],
    ] as const) {
      const b = structuredClone(t);
      b.pickups = [{ at: 0.1, lateral: 0 }, bad];
      expect(() => validateTrack(b)).toThrow(field);
    }
  });

  it('AC1: a track without the key validates to a copy without it, and its layout has no pickups', () => {
    const bends = byName('Bramble Bends');
    expect('pickups' in bends).toBe(false);
    expect('pickups' in validateTrack(bends)).toBe(false);
    expect(trackLayout(bends).pickups).toEqual([]);
  });

  it('AC1: trackLayout gives one world {x, z} per pickup, on the track; Dust Bowl has ≥ 2, Bramble Bends and Hay Loop none', () => {
    const pickups = dustBowl.pickups ?? [];
    expect(pickups.length).toBeGreaterThanOrEqual(2);
    const layout = trackLayout(dustBowl);
    expect(layout.pickups).toHaveLength(pickups.length);
    layout.pickups.forEach((p, i) => {
      expect(Object.keys(p).sort()).toEqual(['x', 'z']);
      // Within |lateral| of the centreline sample `at` of the way round.
      const [cx, cz] = layout.centre[Math.round((pickups[i]?.at ?? 0) * layout.centre.length) % layout.centre.length] as [number, number];
      expect(Math.hypot(p.x - cx, p.z - cz)).toBeLessThan(Math.abs(pickups[i]?.lateral ?? 0) + 1.5);
    });
    for (const name of ['Bramble Bends', 'Hay Loop']) {
      expect(byName(name).pickups ?? []).toEqual([]);
      expect(trackLayout(byName(name)).pickups).toEqual([]);
    }
  });
});

describe('B12 pickups: collecting', () => {
  it('AC2: on Dust Bowl the player starts unarmed with every pickup present; driving through one arms it and takes that box', () => {
    const world = createWorld(dustBowl, { seed: 3, carCount: 2 });
    const layout = trackLayout(dustBowl);
    const start = raceView(world);
    expect(start.racers[0]).toMatchObject({ armed: false, boostTicks: 0 });
    expect(start.pickups).toEqual(layout.pickups.map(() => true));
    let armedAt: RaceView | null = null;
    let wasNear = -1;
    run(world, 600, (w) => {
      if (armedAt) return;
      const view = raceView(w);
      const me = carViews(w)[0] as { x: number; z: number };
      const hit = layout.pickups.findIndex((p) => near(p, me, 2.5));
      if (view.racers[0]?.armed) {
        armedAt = view;
        wasNear = hit;
      }
    });
    expect(armedAt).not.toBeNull();
    const view = armedAt as unknown as RaceView;
    expect(wasNear).toBeGreaterThanOrEqual(0);
    expect(view.pickups?.[wasNear]).toBe(false);
  });
});

describe('B12 pickups: respawn and no stacking', () => {
  it('AC3: a taken box stays away exactly 300 ticks; an armed player drives through another present box and leaves it', () => {
    const world = createWorld(dustBowl, { seed: 2, carCount: 1 });
    const layout = trackLayout(dustBowl);
    const history: boolean[][] = [];
    let armedThrough = 0;
    run(world, 1200, (w) => {
      const view = raceView(w);
      const pickups = view.pickups as boolean[];
      history.push(pickups);
      const me = carViews(w)[0] as { x: number; z: number };
      // Armed and over a present box: it must stay present.
      layout.pickups.forEach((p, i) => {
        if (view.racers[0]?.armed && pickups[i] && near(p, me, 2.5)) armedThrough++;
      });
    });
    const taken = history.findIndex((p) => p.includes(false));
    expect(taken).toBeGreaterThan(0);
    const box = (history[taken] as boolean[]).indexOf(false);
    for (let t = taken; t < taken + 300; t++) expect(history[t]?.[box], `tick ${t - taken}`).toBe(false);
    expect(history[taken + 300]?.[box]).toBe(true);
    // Never armed twice: no other box was ever taken (the player never fires).
    for (const p of history) expect(p.filter((x) => !x).length).toBeLessThanOrEqual(1);
    expect(armedThrough).toBeGreaterThan(0);
  });
});
