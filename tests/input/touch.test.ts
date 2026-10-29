// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createInput } from '../../src/input/index.ts';
import { createTouchInput, hitTest, type TouchControlId, type TouchZone } from '../../src/input/touch.ts';

// The S1–S2 layout at 844×390: pads 84×80 at bottom-left, gas ⌀100 and brake ⌀72 bottom-right.
const ZONES: TouchZone[] = [
  { id: 'left', shape: 'rect', left: 48, top: 289, width: 84, height: 80 },
  { id: 'right', shape: 'rect', left: 140, top: 289, width: 84, height: 80 },
  { id: 'gas', shape: 'circle', cx: 746, cy: 319, r: 50 },
  { id: 'brake', shape: 'circle', cx: 648, cy: 333, r: 36 },
];

type PType = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel';
const ptr = (t: EventTarget, type: PType, pointerId: number, x: number, y: number): void => {
  t.dispatchEvent(new PointerEvent(type, { pointerId, clientX: x, clientY: y, pointerType: 'touch', bubbles: true, cancelable: true }));
};

function setup() {
  const target = new EventTarget();
  const log: string[] = [];
  const touch = createTouchInput(target, {
    zones: () => ZONES,
    listener: { press: (id: TouchControlId) => log.push(`+${id}`), release: (id: TouchControlId) => log.push(`-${id}`) },
  });
  return { target, touch, log };
}

describe('hit slop (12px beyond each drawn shape)', () => {
  it('a touch 11px outside a pad hits, 13px misses', () => {
    // Left of the left pad, vertically centred.
    expect(hitTest(ZONES, 48 - 11, 329)).toBe('left');
    expect(hitTest(ZONES, 48 - 13, 329)).toBeNull();
    // Below the right pad.
    expect(hitTest(ZONES, 182, 369 + 11)).toBe('right');
    expect(hitTest(ZONES, 182, 369 + 13)).toBeNull();
    // Above the left pad.
    expect(hitTest(ZONES, 90, 289 - 11)).toBe('left');
    expect(hitTest(ZONES, 90, 289 - 13)).toBeNull();
  });

  it('a touch 11px outside a round button hits, 13px misses', () => {
    expect(hitTest(ZONES, 746 + 50 + 11, 319)).toBe('gas');
    expect(hitTest(ZONES, 746 + 50 + 13, 319)).toBeNull();
    expect(hitTest(ZONES, 648, 333 - 36 - 11)).toBe('brake');
    expect(hitTest(ZONES, 648, 333 - 36 - 13)).toBeNull();
  });

  it('in the gap between overlapping slop areas, the nearer shape wins', () => {
    // Pads are 8px apart: 3px right of the left pad is 5px left of the right pad.
    expect(hitTest(ZONES, 132 + 3, 329)).toBe('left');
    expect(hitTest(ZONES, 132 + 6, 329)).toBe('right');
  });
});

describe('multi-touch', () => {
  it('holds steer + gas at once', () => {
    const { target, touch, log } = setup();
    ptr(target, 'pointerdown', 1, 90, 329); // left pad
    ptr(target, 'pointerdown', 2, 746, 319); // gas
    expect(touch.state()).toEqual({ left: true, right: false, gas: true, brake: false });
    expect(log).toEqual(['+left', '+gas']);
  });

  it('releasing one pointer does not release another', () => {
    const { target, touch, log } = setup();
    ptr(target, 'pointerdown', 1, 182, 329); // right pad
    ptr(target, 'pointerdown', 2, 746, 319); // gas
    ptr(target, 'pointerup', 1, 182, 329);
    expect(touch.state()).toEqual({ left: false, right: false, gas: true, brake: false });
    ptr(target, 'pointercancel', 2, 746, 319);
    expect(touch.state().gas).toBe(false);
    expect(log).toEqual(['+right', '+gas', '-right', '-gas']);
  });

  it('two fingers on one control: it stays held until both lift', () => {
    const { target, touch, log } = setup();
    ptr(target, 'pointerdown', 1, 740, 319);
    ptr(target, 'pointerdown', 2, 760, 330);
    ptr(target, 'pointerup', 1, 740, 319);
    expect(touch.state().gas).toBe(true);
    ptr(target, 'pointerup', 2, 760, 330);
    expect(touch.state().gas).toBe(false);
    expect(log).toEqual(['+gas', '-gas']);
  });

  it('sliding from one pad onto the other switches steer', () => {
    const { target, touch, log } = setup();
    ptr(target, 'pointerdown', 1, 90, 329);
    ptr(target, 'pointermove', 1, 182, 329);
    expect(touch.state()).toEqual({ left: false, right: true, gas: false, brake: false });
    // Drifting off into empty space keeps the hold.
    ptr(target, 'pointermove', 1, 400, 200);
    expect(touch.state().right).toBe(true);
    expect(log).toEqual(['+left', '+right', '-left']);
  });

  it('touches away from every control do nothing', () => {
    const { target, touch, log } = setup();
    ptr(target, 'pointerdown', 1, 422, 195);
    ptr(target, 'pointerup', 1, 422, 195);
    expect(touch.state()).toEqual({ left: false, right: false, gas: false, brake: false });
    expect(log).toEqual([]);
  });

  it('feeds createInput: steer + gas → CarInput', () => {
    const target = new EventTarget();
    const presses: string[] = [];
    const input = createInput({
      keyTarget: new EventTarget(),
      pointerTarget: target,
      touchZones: () => ZONES,
      touchListener: { press: (id) => presses.push(id), release: () => {} },
    });
    ptr(target, 'pointerdown', 7, 50, 300);
    ptr(target, 'pointerdown', 8, 740, 310);
    expect(input.read()).toEqual({ steer: -1, throttle: true, brake: false });
    ptr(target, 'pointerup', 7, 50, 300);
    expect(input.read()).toEqual({ steer: 0, throttle: true, brake: false });
    expect(presses).toEqual(['left', 'gas']);
    input.destroy();
  });
});

describe('destroy()', () => {
  it('touch input stops listening and releases what it held', () => {
    const { target, touch, log } = setup();
    ptr(target, 'pointerdown', 1, 746, 319);
    touch.destroy();
    ptr(target, 'pointerdown', 2, 90, 329);
    expect(touch.state()).toEqual({ left: false, right: false, gas: false, brake: false });
    expect(log).toEqual(['+gas', '-gas']);
  });

  it('createInput stops listening to keys, pointers and window blur', () => {
    const keys = new EventTarget();
    const pointers = new EventTarget();
    const input = createInput({ keyTarget: keys, pointerTarget: pointers, touchZones: () => ZONES });
    const removed = vi.spyOn(window, 'removeEventListener');
    input.destroy();
    keys.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
    ptr(pointers, 'pointerdown', 1, 90, 329);
    expect(input.read()).toEqual({ steer: 0, throttle: false, brake: false });
    expect(removed).toHaveBeenCalledWith('blur', expect.any(Function));
    removed.mockRestore();
  });
});
