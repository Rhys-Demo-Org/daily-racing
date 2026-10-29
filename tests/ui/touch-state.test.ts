// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tokens } from '@tokens';
import { createTouchControls } from '../../src/ui/touch-controls.ts';
import { createTouchStateMachine } from '../../src/ui/touch-state.ts';

function clock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('touch-control state machine', () => {
  it('rests after 4 s by default (touch.restAfterMs)', () => {
    expect(tokens.touch.restAfterMs).toBe(4000);
    const c = clock();
    const m = createTouchStateMachine({ now: c.now });
    m.wake();
    c.advance(3999);
    expect(m.state('gas')).toBe('active');
    c.advance(1);
    expect(m.state('gas')).toBe('resting');
  });

  it('active → resting after 4 s → pressed → reactivated', () => {
    const c = clock();
    const m = createTouchStateMachine({ now: c.now });
    m.wake();
    expect(m.states()).toEqual({ left: 'active', right: 'active', gas: 'active', brake: 'active' });

    c.advance(4000);
    expect(m.states()).toEqual({ left: 'resting', right: 'resting', gas: 'resting', brake: 'resting' });

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

  it('reports when the next control will rest', () => {
    const c = clock(0);
    const m = createTouchStateMachine({ now: c.now });
    expect(m.nextChangeAt()).toBeNull();
    m.wake();
    expect(m.nextChangeAt()).toBe(4000);
    c.advance(1000);
    m.press('gas');
    expect(m.nextChangeAt()).toBe(4000);
    c.advance(3500);
    expect(m.nextChangeAt()).toBeNull();
    m.release('gas');
    expect(m.nextChangeAt()).toBe(8500);
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
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('renders steer pads with SVG arrows, GAS and BRAKE', () => {
    const tc = createTouchControls(document.body, { visible: true });
    expect(document.querySelectorAll('.ui-tc')).toHaveLength(4);
    expect(document.querySelector('.ui-tc--left svg polygon')).not.toBeNull();
    expect(document.querySelector('.ui-tc--right svg polygon')).not.toBeNull();
    expect(document.querySelector('.ui-tc--gas')?.textContent).toBe('Gas');
    expect(document.querySelector('.ui-tc--brake')?.textContent).toBe('Brake');
    expect(tc.zones().map((z) => [z.id, z.shape])).toEqual([
      ['left', 'rect'],
      ['right', 'rect'],
      ['gas', 'circle'],
      ['brake', 'circle'],
    ]);
  });

  it('follows the state machine with classes: active, retracting → resting, pressed', () => {
    vi.useFakeTimers();
    let t = 0;
    const tc = createTouchControls(document.body, { visible: true, now: () => t });
    const gas = document.querySelector('.ui-tc--gas') as HTMLElement;
    expect(gas.classList.contains('is-resting')).toBe(true);

    tc.wake();
    expect(gas.classList.contains('is-active')).toBe(true);
    expect(gas.classList.contains('is-waking')).toBe(true);

    t = 4000;
    vi.advanceTimersByTime(4000);
    expect(gas.classList.contains('is-retracting')).toBe(true);
    vi.advanceTimersByTime(tokens.motion.durationMs.stamp);
    expect(gas.classList.contains('is-resting')).toBe(true);

    tc.machine.press('gas');
    expect(gas.classList.contains('is-pressed')).toBe(true);
    tc.machine.release('gas');
    expect(gas.classList.contains('is-active')).toBe(true);
    tc.destroy();
  });

  it('is hidden on fine pointers until a touch is seen', () => {
    const tc = createTouchControls(document.body);
    expect(tc.visible).toBe(false);
    expect(tc.zones()).toEqual([]);
    window.dispatchEvent(new Event('touchstart'));
    expect(tc.visible).toBe(true);
    expect(tc.element.hidden).toBe(false);
    tc.destroy();
  });
});
