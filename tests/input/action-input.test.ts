// @vitest-environment happy-dom
// B12: the action (power-up) input from Space and the action touch zone, through createInput().read() (AC7).
import { describe, expect, it } from 'vitest';
import { createInput } from '../../src/input/index.ts';
import type { TouchZone } from '../../src/input/touch.ts';

const ACTION_ZONE: TouchZone = { id: 'action', shape: 'circle', cx: 746, cy: 225, r: 32 };

function key(target: EventTarget, type: 'keydown' | 'keyup', code: string): KeyboardEvent {
  const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

const ptr = (t: EventTarget, type: 'pointerdown' | 'pointerup', x: number, y: number): void => {
  t.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, pointerType: 'touch', bubbles: true, cancelable: true }));
};

function setup() {
  const keys = new EventTarget();
  const pointers = new EventTarget();
  const input = createInput({ keyTarget: keys, pointerTarget: pointers, touchZones: () => [ACTION_ZONE] });
  return { keys, pointers, input };
}

describe('B12 action input', () => {
  it('AC7: Space sets action: true (and is preventDefault-ed); with nothing pressed read() has no action key', () => {
    const { keys, input } = setup();
    expect('action' in input.read()).toBe(false);
    const down = key(keys, 'keydown', 'Space');
    expect(down.defaultPrevented).toBe(true);
    expect(input.read()).toEqual({ steer: 0, throttle: false, brake: false, action: true });
    expect(input.read().action).toBe(true); // still held
    key(keys, 'keyup', 'Space');
    expect('action' in input.read()).toBe(false);
    input.destroy();
  });

  it('AC7: a Space tap released before the next read still gives exactly one read with action: true', () => {
    const { keys, input } = setup();
    key(keys, 'keydown', 'ArrowUp');
    key(keys, 'keydown', 'Space');
    key(keys, 'keyup', 'Space');
    expect(input.read()).toEqual({ steer: 0, throttle: true, brake: false, action: true });
    expect(input.read()).toEqual({ steer: 0, throttle: true, brake: false });
    input.destroy();
  });

  it('AC7: a press on the action touch zone counts, including a tap between reads', () => {
    const { pointers, input } = setup();
    ptr(pointers, 'pointerdown', 746, 225);
    expect(input.read().action).toBe(true);
    ptr(pointers, 'pointerup', 746, 225);
    expect('action' in input.read()).toBe(false);
    ptr(pointers, 'pointerdown', 750, 230);
    ptr(pointers, 'pointerup', 750, 230);
    expect(input.read().action).toBe(true);
    expect('action' in input.read()).toBe(false);
    // Away from the zone: nothing.
    ptr(pointers, 'pointerdown', 400, 200);
    expect('action' in input.read()).toBe(false);
    input.destroy();
  });
});
