// Countdown framing (owner play-test bug: the centred countdown hid the player's car). While the
// countdown is on screen (3, 2, 1, then GO! until it has slid off) the game passes clearCentre to
// the scene's update(): the camera's ground target sits CAMERA.countdownOffsetEast units east of
// where it would be, so the player car shows clear of the roundel at 844×390 and 1440×900. Once
// GO! has gone the offset drops and the follow smoothing eases the camera back by translation.
// Each race below is the game loop headless: bots drive every car, the scene follows car 0 and the
// framing comes from the same countdownOnScreen(raceView) call the game makes.
import { tokens } from '@tokens';
import { describe, expect, it } from 'vitest';
import { raceDrivers } from '../../src/content/drivers.ts';
import { TRACKS } from '../../src/content/tracks.ts';
import { CAMERA, cameraAngles, createCameraRig, createRaceScene, type RaceScene } from '../../src/render/index.ts';
import { COUNTDOWN_TICKS, DT, TICK_HZ, carViews, createBot, createWorld, raceView, stepWorld, type TrackData, type World } from '../../src/sim/index.ts';
import { countdownOnScreen, GO_GONE_MS, GO_GONE_TICKS } from '../../src/ui/countdown.ts';
import { GO_HIDE_TICKS } from '../../src/ui/race-ui.ts';
import { overlaps, playerBox, roundelBox, ROUNDEL_WIDTH_PX, VIEWPORTS } from '../ui/countdown-clear.ts';

const CARS = 6;
const OFFSET: number = CAMERA.countdownOffsetEast;
/** Ticks from the start until GO! has gone. */
const CLEAR_UNTIL = COUNTDOWN_TICKS + GO_GONE_TICKS;

/**
 * A headless race: `framed` follows the game (clearCentre from the countdown), `plain` follows the
 * same cars with no framing, as before the fix. `each` runs after every tick.
 */
function race(track: TrackData, width: number, height: number, ticks: number, each: (tick: number, w: World, framed: RaceScene, plain: RaceScene) => void, framed?: RaceScene): void {
  const world = createWorld(track, { seed: 1, carCount: CARS });
  const bots = Array.from({ length: CARS }, (_, i) => createBot(world, i));
  const scenes = [framed ?? createRaceScene(world.track.layout, raceDrivers(CARS)), createRaceScene(world.track.layout, raceDrivers(CARS))] as const;
  for (const s of scenes) s.resize(width, height);
  const frame = (dt: number): void => {
    const views = carViews(world);
    const clear = countdownOnScreen(raceView(world));
    scenes[0].update(views, dt, clear);
    scenes[1].update(views, dt);
  };
  frame(0); // startRace draws once: the first update snaps
  for (let t = 1; t <= ticks; t++) {
    stepWorld(world, bots.map((b) => b.input(world)));
    frame(DT);
    each(world.tick, world, scenes[0], scenes[1]);
  }
}

describe('countdown framing', () => {
  it('GO! counts as on screen until it has slid off: stamp + 3 slides of hold + a slide, in ticks', () => {
    const ms = tokens.motion.durationMs;
    expect(GO_GONE_MS).toBe(ms.stamp + 4 * ms.slide);
    expect(GO_GONE_TICKS).toBe(Math.ceil((GO_GONE_MS / 1000) * TICK_HZ));
    expect(GO_GONE_TICKS).toBeLessThanOrEqual(GO_HIDE_TICKS); // the countdown layer is still up
    expect(countdownOnScreen({ phase: 'countdown', raceTick: 0 })).toBe(true);
    expect(countdownOnScreen({ phase: 'racing', raceTick: GO_GONE_TICKS - 1 })).toBe(true);
    expect(countdownOnScreen({ phase: 'racing', raceTick: GO_GONE_TICKS })).toBe(false);
  });

  it('the rig shifts its target by the offset, on snap and on follow, by translation only', () => {
    const rig = createCameraRig(844, 390);
    rig.setTargetOffset(OFFSET, 0);
    rig.snap(5, -3);
    expect(rig.target()).toEqual({ x: 5 + OFFSET, z: -3 });
    rig.setTargetOffset(0, 0);
    for (let i = 0; i < 240; i++) rig.follow(5, -3, 0, 0, 1 / 60);
    expect(rig.target().x).toBeCloseTo(5, 6);
    expect(cameraAngles(rig.camera)).toEqual({ pitchDeg: expect.closeTo(CAMERA.pitchDeg, 6), yawDeg: 0, rollDeg: 0 });
  });

  for (const track of TRACKS) {
    for (const v of VIEWPORTS) {
      it(`${track.id} at ${v.width}×${v.height}: the target is ${OFFSET} units east and the car clear of the roundel until GO! has gone`, () => {
        let checked = 0;
        race(track, v.width, v.height, CLEAR_UNTIL - 1, (tick, world, framed, plain) => {
          // Same follow, shifted east by exactly the offset: no zoom, yaw or roll.
          expect(framed.camera.position.x - plain.camera.position.x).toBeCloseTo(OFFSET, 6);
          expect(framed.camera.position.y).toBeCloseTo(plain.camera.position.y, 9);
          expect(framed.camera.position.z).toBeCloseTo(plain.camera.position.z, 6);
          const width = raceView(world).phase === 'countdown' ? ROUNDEL_WIDTH_PX.number : ROUNDEL_WIDTH_PX.go;
          const car = playerBox(framed, v.width, v.height);
          expect(overlaps(car, roundelBox(width, v.width, v.height)), `tick ${tick}: car ${JSON.stringify(car)}`).toBe(false);
          expect(car.left).toBeGreaterThan(0);
          // Before the fix the centred car sat under the roundel.
          if (tick === 1) expect(overlaps(playerBox(plain, v.width, v.height), roundelBox(ROUNDEL_WIDTH_PX.number, v.width, v.height))).toBe(true);
          checked++;
        });
        expect(checked).toBe(CLEAR_UNTIL - 1);
      });
    }

    it(`${track.id}: once GO! has gone the camera eases back to the normal follow target, with no snap`, () => {
      let last = OFFSET;
      race(track, 844, 390, CLEAR_UNTIL + 1.5 * TICK_HZ, (tick, _w, framed, plain) => {
        const gap = framed.camera.position.x - plain.camera.position.x;
        if (tick < CLEAR_UNTIL) return;
        // Exponential ease (followHalfLife): it only shrinks, a little per tick, never jumps.
        const k = Math.pow(0.5, DT / CAMERA.followHalfLife);
        expect(gap).toBeCloseTo(last * k, 6);
        expect(framed.camera.position.z).toBeCloseTo(plain.camera.position.z, 6);
        last = gap;
      });
      expect(last).toBeLessThan(0.01); // 1.5 s after GO! has gone: back on the normal target
    });
  }

  it('a restart (reused scene) and a new scene both start framed clear again, and snapCamera keeps the offset', () => {
    const track = TRACKS[0] as TrackData;
    const world = createWorld(track, { seed: 1, carCount: CARS });
    const reused = createRaceScene(world.track.layout, raceDrivers(CARS));
    race(track, 844, 390, CLEAR_UNTIL + 2 * TICK_HZ, () => {}, reused); // a race past the countdown
    reused.reset();
    const firstTicks: number[] = [];
    race(track, 844, 390, 3, (tick, w, framed, plain) => {
      const p = carViews(w)[0];
      firstTicks.push(tick);
      expect(framed.camera.position.x - plain.camera.position.x).toBeCloseTo(OFFSET, 6);
      expect(framed.camera.position.x).toBeCloseTo((p?.x ?? NaN) + OFFSET, 6); // standing still on the grid
      expect(overlaps(playerBox(framed, 844, 390), roundelBox(ROUNDEL_WIDTH_PX.number, 844, 390))).toBe(false);
    }, reused);
    expect(firstTicks).toEqual([1, 2, 3]);
    const car = reused.cars[0];
    reused.snapCamera();
    expect(reused.camera.position.x).toBeCloseTo((car?.root.position.x ?? NaN) + OFFSET, 6);
    // reset() drops the framing, so a reused scene starts like a fresh one until the game frames it.
    reused.reset();
    reused.snapCamera();
    expect(reused.camera.position.x).toBeCloseTo(car?.root.position.x ?? NaN, 6);
  });
});
