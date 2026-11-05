// @vitest-environment happy-dom
// B06: gamepad input merged into the combined CarInput, read through createInput().read() with
// navigator.getGamepads() mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInput, type Input } from '../../src/input/index.ts';

interface PadOptions {
  buttons?: Record<number, number>;
  x?: number;
  mapping?: string;
}

/** A connected pad; `buttons` maps index → value (pressed when value ≥ 0.5, as browsers report). */
function pad({ buttons = {}, x = 0, mapping = 'standard' }: PadOptions = {}): Gamepad {
  return {
    id: 'test pad',
    index: 0,
    connected: true,
    mapping,
    timestamp: 0,
    axes: [x, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => {
      const value = buttons[i] ?? 0;
      return { value, pressed: value >= 0.5, touched: value > 0 };
    }),
  } as unknown as Gamepad;
}

let pads: (Gamepad | null)[] = [];
let keys: EventTarget;
let input: Input;

beforeEach(() => {
  pads = [];
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, writable: true, value: () => pads });
  keys = new EventTarget();
  input = createInput({ keyTarget: keys, pointerTarget: new EventTarget() });
});

afterEach(() => {
  input.destroy();
  Reflect.deleteProperty(navigator, 'getGamepads');
  vi.unstubAllGlobals();
});

const key = (type: 'keydown' | 'keyup', code: string): void => {
  keys.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
};

/** What read() gives for a key held alone (no pad). */
function keyInput(code: string): unknown {
  const saved = pads;
  pads = [];
  key('keydown', code);
  const r = input.read();
  key('keyup', code);
  pads = saved;
  return r;
}

const steerAt = (x: number): number => {
  pads = [pad({ x })];
  return input.read().steer;
};

describe('AC1: gamepad buttons read like their keys', () => {
  it.each([
    [14, 'ArrowLeft', { steer: -1, throttle: false, brake: false }],
    [15, 'ArrowRight', { steer: 1, throttle: false, brake: false }],
    [7, 'ArrowUp', { steer: 0, throttle: true, brake: false }],
    [6, 'ArrowDown', { steer: 0, throttle: false, brake: true }],
  ])('AC1: button %i = %s', (button, code, expected) => {
    expect(keyInput(code)).toEqual(expected);
    pads = [pad({ buttons: { [button]: 1 } })];
    expect(input.read()).toEqual(expected);
  });
});

describe('AC2: left stick X steers analogue', () => {
  it('AC2: full tilt matches the arrow keys, partial tilt is proportional and symmetric', () => {
    expect(steerAt(-1)).toBe((keyInput('ArrowLeft') as { steer: number }).steer);
    expect(steerAt(1)).toBe((keyInput('ArrowRight') as { steer: number }).steer);
    expect(steerAt(-1)).toBe(-1);
    expect(steerAt(1)).toBe(1);
    const s6 = steerAt(0.6);
    const s4 = steerAt(0.4);
    expect(s6).toBeGreaterThan(0);
    expect(s6).toBeLessThan(1);
    expect(s6).toBeGreaterThan(s4);
    expect(steerAt(-0.6)).toBe(-s6);
  });
});

describe('AC3: stick dead-zone', () => {
  it.each([0.12, -0.1, 0.15, -0.15, 0])('AC3: stick %f reads exactly no input', (x) => {
    pads = [pad({ x })];
    const r = input.read();
    expect(Object.is(r.steer, 0)).toBe(true);
    expect(r).toEqual({ steer: 0, throttle: false, brake: false });
  });

  it('AC3: just past the dead-zone steer is small but not zero', () => {
    const s = steerAt(0.2);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(0.1);
  });
});

describe('AC4: triggers, clamping and ignored pads', () => {
  it('AC4: a trigger counts only when pressed', () => {
    pads = [pad({ buttons: { 7: 1, 6: 1 } })];
    expect(input.read()).toEqual({ steer: 0, throttle: true, brake: true });
    pads = [pad({ buttons: { 7: 0.1, 6: 0.1 } })];
    expect(input.read()).toEqual({ steer: 0, throttle: false, brake: false });
  });

  it('AC4: pad steer plus a held arrow key stays within −1…+1', () => {
    key('keydown', 'ArrowRight');
    pads = [pad({ x: 1, buttons: { 15: 1 } })];
    expect(input.read().steer).toBe(1);
    pads = [pad({ x: 0.6 })];
    expect(input.read().steer).toBe(1);
    key('keyup', 'ArrowRight');
    key('keydown', 'ArrowLeft');
    pads = [pad({ x: -1, buttons: { 14: 1 } })];
    expect(input.read().steer).toBe(-1);
    pads = [pad({ x: 0.6 })];
    const r = input.read().steer;
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThan(0);
  });

  it('AC4: non-standard pads and null slots are ignored; keys still work', () => {
    pads = [null, pad({ mapping: '', x: 1, buttons: { 7: 1, 14: 1 } }), null];
    expect(input.read()).toEqual({ steer: 0, throttle: false, brake: false });
    key('keydown', 'ArrowUp');
    expect(input.read()).toEqual({ steer: 0, throttle: true, brake: false });
  });

  it('AC4: without navigator.getGamepads the keyboard still works', () => {
    Reflect.deleteProperty(navigator, 'getGamepads');
    expect('getGamepads' in navigator && typeof navigator.getGamepads === 'function').toBe(false);
    expect(input.read()).toEqual({ steer: 0, throttle: false, brake: false });
    key('keydown', 'ArrowLeft');
    expect(input.read()).toEqual({ steer: -1, throttle: false, brake: false });
  });
});

describe('AC7: A never drives the car', () => {
  it('AC7: only A held reads as no input', () => {
    pads = [pad({ buttons: { 0: 1 } })];
    expect(input.read()).toEqual({ steer: 0, throttle: false, brake: false });
  });
});
