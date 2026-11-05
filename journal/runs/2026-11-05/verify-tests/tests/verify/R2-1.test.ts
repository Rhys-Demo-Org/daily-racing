// @vitest-environment happy-dom
// R2-1: navigator.getGamepads() throws SecurityError when the gamepad permissions policy blocks it;
// that must read as "no pads" so keyboard input keeps working.
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createInput, type Input } from '../../src/input/index.ts';

let keys: EventTarget;
let input: Input;

beforeEach(() => {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    writable: true,
    value: () => {
      throw new DOMException('blocked', 'SecurityError');
    },
  });
  keys = new EventTarget();
  input = createInput({ keyTarget: keys, pointerTarget: new EventTarget() });
});

afterEach(() => {
  input.destroy();
  Reflect.deleteProperty(navigator, 'getGamepads');
});

it('R2-1: a blocked Gamepad API leaves keyboard input working', () => {
  keys.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true, cancelable: true }));
  let r: unknown;
  expect(() => {
    r = input.read();
  }).not.toThrow();
  expect(r).toEqual({ steer: -1, throttle: false, brake: false });
  expect(() => input.confirmPressed()).not.toThrow();
  expect(input.confirmPressed()).toBe(false);
});
