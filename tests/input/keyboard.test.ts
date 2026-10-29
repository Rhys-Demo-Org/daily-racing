// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createInput } from '../../src/input/index.ts';
import { createKeyboard } from '../../src/input/keyboard.ts';

const key = (target: EventTarget, type: 'keydown' | 'keyup', code: string): void => {
  target.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
};

describe('keyboard map', () => {
  it.each([
    ['ArrowLeft', { steer: -1, throttle: false, brake: false }],
    ['KeyA', { steer: -1, throttle: false, brake: false }],
    ['ArrowRight', { steer: 1, throttle: false, brake: false }],
    ['KeyD', { steer: 1, throttle: false, brake: false }],
    ['ArrowUp', { steer: 0, throttle: true, brake: false }],
    ['KeyW', { steer: 0, throttle: true, brake: false }],
    ['ArrowDown', { steer: 0, throttle: false, brake: true }],
    ['KeyS', { steer: 0, throttle: false, brake: true }],
  ])('%s → %o', (code, expected) => {
    const t = new EventTarget();
    const input = createInput({ keyTarget: t, pointerTarget: new EventTarget() });
    key(t, 'keydown', code);
    expect(input.read()).toEqual(expected);
    input.destroy();
  });

  it('tracks held keys and releases them independently', () => {
    const t = new EventTarget();
    const kb = createKeyboard(t);
    key(t, 'keydown', 'ArrowLeft');
    key(t, 'keydown', 'KeyA');
    expect(kb.state().left).toBe(true);
    key(t, 'keyup', 'ArrowLeft');
    expect(kb.state().left).toBe(true); // A still down
    key(t, 'keyup', 'KeyA');
    expect(kb.state().left).toBe(false);
    kb.destroy();
  });

  it('ignores unmapped keys and shortcuts', () => {
    const t = new EventTarget();
    const kb = createKeyboard(t);
    key(t, 'keydown', 'KeyQ');
    t.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', ctrlKey: true }));
    expect(kb.state()).toEqual({ left: false, right: false, gas: false, brake: false });
    kb.destroy();
  });
});

describe('createInput with the keyboard', () => {
  let input: ReturnType<typeof createInput> | null = null;
  afterEach(() => input?.destroy());

  it('produces CarInput: ←→ steer −1/+1, ↑ gas, ↓ brake', () => {
    const t = new EventTarget();
    input = createInput({ keyTarget: t, pointerTarget: new EventTarget() });
    expect(input.read()).toEqual({ steer: 0, throttle: false, brake: false });
    key(t, 'keydown', 'ArrowLeft');
    expect(input.read().steer).toBe(-1);
    key(t, 'keyup', 'ArrowLeft');
    key(t, 'keydown', 'KeyD');
    expect(input.read().steer).toBe(1);
    key(t, 'keydown', 'KeyW');
    expect(input.read()).toEqual({ steer: 1, throttle: true, brake: false });
    key(t, 'keydown', 'ArrowDown');
    expect(input.read().brake).toBe(true);
  });

  it('left and right together cancel', () => {
    const t = new EventTarget();
    input = createInput({ keyTarget: t, pointerTarget: new EventTarget() });
    key(t, 'keydown', 'ArrowLeft');
    key(t, 'keydown', 'ArrowRight');
    expect(input.read().steer).toBe(0);
  });

  it('releases everything when the window loses focus', () => {
    const t = new EventTarget();
    input = createInput({ keyTarget: t, pointerTarget: new EventTarget() });
    key(t, 'keydown', 'ArrowUp');
    window.dispatchEvent(new Event('blur'));
    expect(input.read().throttle).toBe(false);
  });
});
