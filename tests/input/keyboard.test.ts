// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { KEY_MAP, createInput, createKeyboard } from '../../src/input/index.ts';

const key = (target: EventTarget, type: 'keydown' | 'keyup', code: string): void => {
  target.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
};

describe('keyboard map', () => {
  it('maps arrows and WASD to steer, gas and brake', () => {
    expect(KEY_MAP).toEqual({
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowUp: 'gas',
      KeyW: 'gas',
      ArrowDown: 'brake',
      KeyS: 'brake',
    });
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
