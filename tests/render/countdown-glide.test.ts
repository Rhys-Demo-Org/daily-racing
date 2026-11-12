// Countdown glide (owner play-test: the camera "snaps back quite quickly" once GO! has gone). The
// game now passes countdownFraming(view) as the scene's framing, so the countdown offset eases out
// over GO_GLIDE_SECONDS with a smoothstep instead of dropping in one tick and
// leaving the 0.12 s follow smoothing to pull the camera back. Each race below is the game loop
// headless, framed by the same call the game makes, next to a scene that follows the same cars
// with no framing: their camera x gap is the offset still applied, by translation only.
import { describe, expect, it } from 'vitest';
import { raceDrivers } from '../../src/content/drivers.ts';
import { TRACKS } from '../../src/content/tracks.ts';
import { countdownOffsetEast, createRaceScene } from '../../src/render/index.ts';
import { COUNTDOWN_TICKS, DT, TICK_HZ, carViews, createBot, createWorld, raceView, stepWorld, type TrackData } from '../../src/sim/index.ts';
import { COUNTDOWN_HALF_WIDTH, countdownFraming, GO_GLIDE_SECONDS, GO_GONE_TICKS } from '../../src/ui/countdown.ts';
import { VIEWPORTS } from '../ui/countdown-clear.ts';

const CARS = 6;
const GONE = COUNTDOWN_TICKS + GO_GONE_TICKS;
const GLIDE_TICKS = Math.round(GO_GLIDE_SECONDS * TICK_HZ);
/** Largest camera move the glide may make in one tick, units: the old drop moved ≈ 1.3 on its first tick. */
const MAX_STEP = 0.35;

/** Camera x gap (framed − plain) after every world tick, from the start to `ticks`. */
function gaps(track: TrackData, width: number, height: number, ticks: number): number[] {
  const world = createWorld(track, { seed: 1, carCount: CARS });
  const bots = Array.from({ length: CARS }, (_, i) => createBot(world, i));
  const framed = createRaceScene(world.track.layout, raceDrivers(CARS));
  const plain = createRaceScene(world.track.layout, raceDrivers(CARS));
  framed.resize(width, height);
  plain.resize(width, height);
  const out: number[] = [];
  const frame = (dt: number): void => {
    const views = carViews(world);
    framed.update(views, dt, COUNTDOWN_HALF_WIDTH, countdownFraming(raceView(world)));
    plain.update(views, dt);
    out[world.tick] = framed.camera.position.x - plain.camera.position.x;
    expect(framed.camera.position.y).toBeCloseTo(plain.camera.position.y, 9);
    expect(framed.camera.position.z).toBeCloseTo(plain.camera.position.z, 6);
  };
  frame(0);
  for (let t = 1; t <= ticks; t++) {
    stepWorld(world, bots.map((b) => b.input(world)));
    frame(DT);
  }
  return out;
}

describe('countdown glide', () => {
  it('countdownFraming holds 1 until GO! has gone, then smoothsteps to 0 over the glide and stays there', () => {
    expect(GO_GLIDE_SECONDS).toBeGreaterThanOrEqual(1);
    expect(GO_GLIDE_SECONDS).toBeLessThanOrEqual(1.5);
    const at = (seconds: number): number => countdownFraming({ raceTick: GO_GONE_TICKS + seconds * TICK_HZ });
    expect(countdownFraming({ raceTick: 0 })).toBe(1); // 3, 2, 1 and GO! (raceTick is 0 until GO)
    expect(countdownFraming({ raceTick: GO_GONE_TICKS - 1 })).toBe(1);
    expect(at(0)).toBe(1);
    expect(at(GO_GLIDE_SECONDS / 2)).toBeCloseTo(0.5, 9);
    expect(at(GO_GLIDE_SECONDS)).toBe(0);
    expect(at(10)).toBe(0);
    // Eases in and out: the first and last tenths move far less than the middle tenth.
    const g = GO_GLIDE_SECONDS;
    const start = 1 - at(g / 10);
    expect(start).toBeLessThan((at(0.45 * g) - at(0.55 * g)) / 4);
    expect(at(0.9 * g)).toBeCloseTo(start, 9);
  });

  for (const track of TRACKS) {
    for (const v of VIEWPORTS) {
      it(`${track.id} at ${v.width}×${v.height}: after GO! has gone the camera glides back, never jumping, and lands on the normal follow`, () => {
        const offset = countdownOffsetEast(COUNTDOWN_HALF_WIDTH, v.width, v.height);
        const g = gaps(track, v.width, v.height, GONE + GLIDE_TICKS + TICK_HZ);
        // Fully framed until GO! has gone.
        for (let t = 0; t < GONE; t++) expect(g[t]).toBeCloseTo(offset, 6);
        let steps = 0;
        for (let t = GONE; t <= GONE + GLIDE_TICKS + TICK_HZ; t++) {
          const prev = g[t - 1] ?? NaN;
          const gap = g[t] ?? NaN;
          expect(gap, `tick ${t}`).toBeLessThanOrEqual(prev + 1e-9); // only ever shrinks
          expect(gap, `tick ${t}`).toBeGreaterThanOrEqual(-1e-9); // never overshoots
          expect(prev - gap, `tick ${t}`).toBeLessThan(MAX_STEP);
          steps++;
        }
        expect(steps).toBe(GLIDE_TICKS + TICK_HZ + 1);
        // Unhurried: half a second in, most of the offset is still there; a second in, under half.
        expect(g[GONE + TICK_HZ / 2]).toBeGreaterThan(0.7 * offset);
        expect(g[GONE + TICK_HZ]).toBeGreaterThan(0.1 * offset);
        // The offset is 0 at the end of the glide (the camera trails it a little); the follow lands within a second.
        expect(g[GONE + GLIDE_TICKS]).toBeLessThan(0.1 * offset);
        expect(g[GONE + GLIDE_TICKS + TICK_HZ]).toBeLessThan(0.01);
      });
    }
  }
});
