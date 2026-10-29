import { describe, expect, it } from 'vitest';
import type { CarInput, CarView } from '../../src/sim/types.ts';
import {
  base64ToBytes,
  bytesToBase64,
  createReplay,
  decodeInputs,
  decodeReplay,
  encodeInputs,
  encodeReplay,
  replayInputs,
  runReplay,
} from '../../src/sim/replay.ts';
import { createRng, nextFloat } from '../../src/sim/rng.ts';
import { carViews, createWorld, stepWorld } from '../../src/sim/world.ts';
import { botsFor, dustBowl } from './helpers.ts';

describe('base64', () => {
  it('matches standard base64', () => {
    const enc = (s: string): string => bytesToBase64(new TextEncoder().encode(s));
    expect(enc('')).toBe('');
    expect(enc('M')).toBe('TQ==');
    expect(enc('Ma')).toBe('TWE=');
    expect(enc('Man')).toBe('TWFu');
    expect(enc('hello world')).toBe('aGVsbG8gd29ybGQ=');
  });

  it('round-trips every byte value at every padding length', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    for (const n of [0, 1, 2, 3, 254, 255, 256]) {
      const bytes = all.slice(0, n);
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
  });

  it('rejects malformed input', () => {
    expect(() => base64ToBytes('abc')).toThrow(/multiple of 4/);
    expect(() => base64ToBytes('ab$d')).toThrow(/invalid character/);
    expect(() => base64ToBytes('a=bc')).toThrow(/invalid character/);
  });
});

describe('replay format v1 (frozen)', () => {
  it('stores steer as int8 and flags as bits, car-major within a tick', () => {
    const frames: CarInput[][] = [
      [
        { steer: -1, throttle: true, brake: false },
        { steer: 0.5, throttle: false, brake: true },
      ],
    ];
    // −1 → −127 → 0x81, flags 0b01; 0.5 → round(63.5) = 64 → 0x40, flags 0b10.
    expect(encodeInputs(frames, 2)).toBe(bytesToBase64(Uint8Array.from([0x81, 0x01, 0x40, 0x02])));
    expect(encodeInputs(frames, 2)).toBe('gQFAAg==');
    expect(decodeInputs('gQFAAg==', 1, 2)).toEqual([
      [
        { steer: -1, throttle: true, brake: false },
        { steer: 64 / 127, throttle: false, brake: true },
      ],
    ]);
  });

  it('ignores the reserved action bit when decoding', () => {
    const text = bytesToBase64(Uint8Array.from([0x00, 0b111]));
    expect(decodeInputs(text, 1, 1)).toEqual([[{ steer: 0, throttle: true, brake: true }]]);
  });

  it('has the documented JSON envelope', () => {
    const replay = createReplay('dust-bowl', 7, 1, [[{ steer: 0, throttle: true, brake: false }]]);
    expect(JSON.parse(encodeReplay(replay))).toEqual({
      version: 1,
      track: 'dust-bowl',
      seed: 7,
      carCount: 1,
      ticks: 1,
      inputs: 'AAE=',
    });
  });

  it('rejects malformed envelopes', () => {
    const good = JSON.parse(encodeReplay(createReplay('dust-bowl', 1, 1, [[{ steer: 0, throttle: true, brake: false }]])));
    expect(() => decodeReplay(JSON.stringify({ ...good, version: 2 }))).toThrow(/version/);
    expect(() => decodeReplay(JSON.stringify({ ...good, ticks: 2 }))).toThrow(/input bytes/);
    expect(() => decodeReplay(JSON.stringify({ ...good, carCount: 0 }))).toThrow(/carCount/);
    expect(() => decodeReplay(JSON.stringify({ ...good, track: 3 }))).toThrow(/track/);
    expect(() => decodeReplay('[]')).toThrow();
    expect(() => runReplay({ ...dustBowl, id: 'other-track' }, good)).toThrow(/recorded on/);
  });
});

describe('replay round trip', () => {
  /** Records a 3-car race of bots with un-quantised, noisy inputs. */
  function record(ticks: number): { frames: CarInput[][]; end: CarView[] } {
    const world = createWorld(dustBowl, { seed: 77, carCount: 3 });
    const bots = botsFor(world);
    const noise = createRng(5);
    const frames: CarInput[][] = [];
    for (let t = 0; t < ticks; t++) {
      const frame = bots.map((bot) => {
        const a = bot.input(world);
        return {
          steer: Math.max(-1, Math.min(1, a.steer + (nextFloat(noise) - 0.5) * 0.37)),
          throttle: a.throttle && nextFloat(noise) < 0.95,
          brake: a.brake || nextFloat(noise) > 0.98,
        };
      });
      frames.push(frame);
      stepWorld(world, frame);
    }
    return { frames, end: carViews(world) };
  }

  const { frames, end } = record(3000);

  it('encode then decode gives the same inputs (steer quantised to int8)', () => {
    const replay = decodeReplay(encodeReplay(createReplay('dust-bowl', 77, 3, frames)));
    const decoded = replayInputs(replay);
    expect(decoded).toHaveLength(frames.length);
    decoded.forEach((frame, t) =>
      frame.forEach((input, c) => {
        const original = frames[t]![c]!;
        expect(input.throttle).toBe(original.throttle);
        expect(input.brake).toBe(original.brake);
        expect(input.steer).toBe((Math.round(original.steer * 127) || 0) / 127);
      }),
    );
    // Decoding is stable: re-encoding the decoded frames gives the same payload.
    expect(encodeInputs(decoded, 3)).toBe(replay.inputs);
  });

  it('replaying reproduces the exact end state', () => {
    const replay = decodeReplay(encodeReplay(createReplay('dust-bowl', 77, 3, frames)));
    const replayed = runReplay(dustBowl, replay);
    expect(replayed).toEqual(end);
    replayed.forEach((car, i) => {
      const live = end[i]!;
      for (const key of ['x', 'y', 'z', 'heading', 'speed', 'slip'] as const) {
        expect(Object.is(car[key], live[key])).toBe(true);
      }
    });
    // The recording covers real driving, not a car sitting on the grid.
    expect(end[0]!.x).not.toBeCloseTo(carViews(createWorld(dustBowl, { seed: 77, carCount: 3 }))[0]!.x, 0);
  });
});
