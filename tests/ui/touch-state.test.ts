// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { tokens } from '@tokens';
import { TOUCH_CONTROL_IDS } from '../../src/input/touch.ts';
import { createTouchControls } from '../../src/ui/touch-controls.ts';
import { createTouchStateMachine, type TouchStateMachine } from '../../src/ui/touch-state.ts';
import './helpers.ts';

function clock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const states = (m: TouchStateMachine): string[] => TOUCH_CONTROL_IDS.map((id) => m.state(id));

describe('touch-control state machine', () => {
  it('active → resting after 4 s → pressed → reactivated', () => {
    expect(tokens.touch.restAfterMs).toBe(4000);
    const c = clock();
    const m = createTouchStateMachine({ now: c.now });
    m.wake();
    expect(states(m)).toEqual(['active', 'active', 'active', 'active']);

    c.advance(4000);
    expect(states(m)).toEqual(['resting', 'resting', 'resting', 'resting']);

    m.press('left');
    expect(m.state('left')).toBe('pressed');
    expect(m.state('right')).toBe('resting');

    // Held longer than the rest time: still pressed.
    c.advance(10000);
    expect(m.state('left')).toBe('pressed');

    m.release('left');
    expect(m.state('left')).toBe('active');
    expect(m.state('gas')).toBe('resting');

    c.advance(3999);
    expect(m.state('left')).toBe('active');
    c.advance(1);
    expect(m.state('left')).toBe('resting');
  });

  it('starts resting until the race wakes it', () => {
    const m = createTouchStateMachine({ now: clock().now });
    expect(m.state('brake')).toBe('resting');
  });

  it('resume (wake) reactivates every control', () => {
    const c = clock();
    const m = createTouchStateMachine({ now: c.now });
    m.wake();
    c.advance(5000);
    m.wake();
    expect(m.state('right')).toBe('active');
  });

  it('reports how long until the next control rests', () => {
    const c = clock(0);
    const m = createTouchStateMachine({ now: c.now });
    expect(m.nextChangeIn()).toBeNull();
    m.wake();
    expect(m.nextChangeIn()).toBe(4000);
    c.advance(1000);
    m.press('gas');
    expect(m.nextChangeIn()).toBe(3000);
    c.advance(3500);
    expect(m.nextChangeIn()).toBeNull();
    m.release('gas');
    expect(m.nextChangeIn()).toBe(4000);
  });

  it('notifies subscribers on press, release and wake', () => {
    const m = createTouchStateMachine({ now: clock().now });
    const fn = vi.fn();
    const off = m.subscribe(fn);
    m.wake();
    m.press('gas');
    m.release('gas');
    expect(fn).toHaveBeenCalledTimes(3);
    off();
    m.wake();
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('touch-controls view', () => {
  const gas = (): HTMLElement => document.querySelector('.ui-tc--gas') as HTMLElement;
  const touch = (): boolean => window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }));
  /** Lays slots out like a browser: zero size inside anything hidden. */
  const layout = () =>
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.closest('[hidden]') ? new DOMRect() : new DOMRect(48, 289, 84, 80);
    });

  it('renders steer pads with SVG arrows, GAS and BRAKE', () => {
    layout();
    const tc = createTouchControls(document.body);
    touch();
    expect(document.querySelectorAll('.ui-tc')).toHaveLength(4);
    expect(document.querySelector('.ui-tc--left svg polygon')).not.toBeNull();
    expect(document.querySelector('.ui-tc--right svg polygon')).not.toBeNull();
    expect(gas().textContent).toBe('Gas');
    expect(document.querySelector('.ui-tc--brake')?.textContent).toBe('Brake');
    expect(tc.zones().map((z) => [z.id, z.shape])).toEqual([
      ['left', 'rect'],
      ['right', 'rect'],
      ['gas', 'circle'],
      ['brake', 'circle'],
    ]);
    tc.destroy();
  });

  it('follows the state machine with classes: active, retracting → resting, pressed', () => {
    vi.useFakeTimers();
    let t = 0;
    const tc = createTouchControls(document.body, { now: () => t });
    expect(gas().classList.contains('is-resting')).toBe(true);

    tc.wake();
    expect(gas().classList.contains('is-active')).toBe(true);
    expect(gas().classList.contains('is-waking')).toBe(true);

    t = 4000;
    vi.advanceTimersByTime(4000);
    expect(gas().classList.contains('is-retracting')).toBe(true);
    vi.advanceTimersByTime(tokens.motion.durationMs.stamp);
    expect(gas().classList.contains('is-resting')).toBe(true);

    tc.machine.press('gas');
    expect(gas().classList.contains('is-pressed')).toBe(true);
    tc.machine.release('gas');
    expect(gas().classList.contains('is-active')).toBe(true);
    tc.destroy();
  });

  it('a control woken while it retracts stays active', () => {
    vi.useFakeTimers();
    let t = 0;
    const tc = createTouchControls(document.body, { now: () => t });
    tc.wake();
    t = 4000;
    vi.advanceTimersByTime(4000);
    expect(gas().classList.contains('is-retracting')).toBe(true);
    tc.wake();
    expect([...gas().classList]).toEqual(['ui-tc', 'ui-tc--gas', 'is-active', 'is-waking']);
    vi.advanceTimersByTime(tokens.motion.durationMs.stamp);
    expect([...gas().classList]).toEqual(['ui-tc', 'ui-tc--gas', 'is-active']);
    tc.destroy();
  });

  it('is hidden with no zones on fine pointers until a touch is seen', () => {
    layout();
    const tc = createTouchControls(document.body);
    expect(tc.element.hidden).toBe(true);
    expect(tc.zones()).toEqual([]);
    touch();
    expect(tc.element.hidden).toBe(false);
    expect(tc.zones()).toHaveLength(4);
    tc.destroy();
  });

  it('caches zones until the layer resizes, and has none while an ancestor is hidden', () => {
    const rects = layout();
    let resized = (): void => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          resized = cb;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    const raceLayer = document.body.appendChild(document.createElement('div'));
    const tc = createTouchControls(raceLayer);
    touch();
    expect(tc.zones()).toHaveLength(4);
    const measured = rects.mock.calls.length;
    tc.zones();
    expect(rects.mock.calls.length).toBe(measured);
    // Hidden zones would sit at (0, 0) and catch taps near the top-left corner.
    raceLayer.hidden = true;
    resized();
    expect(tc.zones()).toEqual([]);
    tc.destroy();
  });

  it('destroy() removes its listeners and timers', () => {
    vi.useFakeTimers();
    const tc = createTouchControls(document.body);
    tc.wake();
    const button = gas();
    tc.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector('.ui-touch')).toBeNull();
    touch();
    tc.machine.press('gas');
    expect(tc.element.hidden).toBe(true);
    expect(button.classList.contains('is-pressed')).toBe(false);
  });
});
