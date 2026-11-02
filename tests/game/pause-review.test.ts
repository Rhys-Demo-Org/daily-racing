// @vitest-environment happy-dom
// B01 · Pause screen: regression tests from the post-build review (journal/runs/2026-10-30/review.md).
// createGame runs with the render layer stubbed and requestAnimationFrame driven by hand.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/game.ts';
import { createInput } from '../../src/input/index.ts';

const scene = vi.hoisted(() => ({ render: vi.fn() }));

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render: scene.render, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

let frames: FrameRequestCallback[] = [];
let now = 0;
/** Games are never torn down; parking each on the menu stops it reacting to later tests' Esc and resize. */
const games: ReturnType<typeof createGame>[] = [];

beforeEach(() => {
  frames = [];
  now = 0;
  scene.render.mockClear();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
});

afterEach(() => {
  for (const g of games.splice(0)) g.showMenu();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/** Runs `n` animation frames, 1/60 s apart. */
function runFrames(n: number): void {
  for (let i = 0; i < n; i++) {
    now += 1000 / 60;
    const queued = frames;
    frames = [];
    for (const cb of queued) cb(now);
  }
}

function setup(): { game: ReturnType<typeof createGame>; root: HTMLElement } {
  const root = document.createElement('div');
  document.body.append(root);
  const game = createGame(root);
  games.push(game);
  return { game, root };
}

const key = (target: EventTarget, init: KeyboardEventInit): boolean => target.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', ...init }));
const esc = (): boolean => key(window, {});

describe('B01 review: pause key lives in src/input', () => {
  it('Esc calls onPause once per press (no key repeat, no modifiers) and never moves the car', () => {
    const t = new EventTarget();
    const onPause = vi.fn();
    const input = createInput({ keyTarget: t, pointerTarget: new EventTarget(), onPause });
    key(t, {});
    key(t, { repeat: true });
    key(t, { ctrlKey: true });
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(input.read()).toEqual({ steer: 0, throttle: false, brake: false });
    input.destroy();
    key(t, {});
    expect(onPause).toHaveBeenCalledTimes(1);
  });
});

describe('B01 review: pause in a running game', () => {
  it('the PAUSE button is the outermost widget of the top-right stack, right of TIME (mockup S1–S2)', () => {
    const { game, root } = setup();
    game.startRace({ seed: 1 });
    const stack = root.querySelector('.ui-hud__tr');
    expect(stack?.lastElementChild?.getAttribute('aria-label')).toBe('Pause');
    expect(stack?.firstElementChild?.querySelector('.ui-hud-time')).not.toBeNull();
  });

  it('the loop is idle while paused, and the driver resume() cannot restart it', () => {
    const { game } = setup();
    game.startRace({ seed: 2 });
    for (let i = 0; i < 600 && game.state().race?.phase === 'countdown'; i++) game.step(1);
    runFrames(10);
    esc();
    const tick = game.state().race?.raceTick;
    expect(frames).toHaveLength(0);
    game.freeze();
    game.resume();
    runFrames(60);
    expect(game.state().race?.raceTick).toBe(tick);
    esc();
    runFrames(1);
    expect(game.state().race?.raceTick).toBe((tick ?? 0) + 1);
  });

  it('a resize while paused redraws the frozen race (resizing clears the canvas)', () => {
    const { game } = setup();
    game.startRace({ seed: 3 });
    runFrames(5);
    esc();
    scene.render.mockClear();
    window.dispatchEvent(new Event('resize'));
    expect(scene.render).toHaveBeenCalledTimes(1);
  });

  it('touch controls cannot be pressed through the pause overlay', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.closest('[hidden]') ? new DOMRect() : new DOMRect(48, 289, 84, 80);
    });
    const { game, root } = setup();
    game.startRace({ seed: 4 });
    const left = (): boolean => root.querySelector('.ui-tc--left')?.classList.contains('is-pressed') ?? false;
    const pointer = (type: string, pointerId: number): boolean =>
      window.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId, clientX: 60, clientY: 300 }));

    esc();
    pointer('pointerdown', 1);
    expect(left()).toBe(false);
    pointer('pointerup', 1);
    esc();
    pointer('pointerdown', 2);
    expect(left()).toBe(true);
  });
});
