// @vitest-environment happy-dom
// B01 · Pause screen (S4). Game tests run createGame with the render layer stubbed and
// requestAnimationFrame driven by hand.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/game.ts';
import type { CarView, RaceView, RacerView } from '../../src/sim/types.ts';
import { createPauseScreen } from '../../src/ui/pause-screen.ts';
import { createRaceUi } from '../../src/ui/race-ui.ts';
import { outline } from '../ui/helpers.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

type Game = ReturnType<typeof createGame>;

let frames: FrameRequestCallback[] = [];
let now = 0;
let clock = 0;

beforeEach(() => {
  frames = [];
  now = 0;
  clock = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
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

function setup(): { game: Game; q: (sel: string) => HTMLElement | null } {
  const root = document.createElement('div');
  document.body.append(root);
  const game = createGame(root);
  return { game, q: (sel) => root.querySelector<HTMLElement>(sel) };
}

const esc = (): boolean => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
const pauseButton = (q: (sel: string) => HTMLElement | null): HTMLButtonElement | null => q('.ui-hud__tr button[aria-label="Pause"]') as HTMLButtonElement | null;
const pauseOverlay = (q: (sel: string) => HTMLElement | null): HTMLElement | null => q('[role="dialog"][aria-label="Paused"]')?.closest<HTMLElement>('.ui-layer') ?? null;

/** Steps the race past the countdown (driver path, no real time). */
function toRacing(game: Game): void {
  for (let i = 0; i < 600 && game.state().race?.phase === 'countdown'; i++) game.step(1);
  expect(game.state().race?.phase).toBe('racing');
}

const car = (x: number): CarView => ({ x, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false });
const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });

describe('B01 pause screen', () => {
  it('AC1: a Pause button sits beside TIME in the top-right stack and toggles the pause overlay', () => {
    const { game, q } = setup();
    game.startRace({ seed: 1 });
    runFrames(3);
    const button = pauseButton(q);
    expect(button).not.toBeNull();
    expect(q('.ui-hud__tr')?.querySelector('.ui-hud-time')).not.toBeNull();
    expect(pauseOverlay(q)?.hidden).toBe(true);
    button?.click();
    expect(pauseOverlay(q)?.hidden).toBe(false);
    expect(game.state().paused).toBe(true);
    button?.click();
    expect(pauseOverlay(q)?.hidden).toBe(true);
    expect(game.state().paused).toBe(false);
  });

  it('AC2: the overlay has an ink hatch and a card headed "Paused" and "LAP 2/3 · 1:24.36"', () => {
    const screen = createPauseScreen(document.body, { onResume: vi.fn(), onRestart: vi.fn(), onQuit: vi.fn() });
    expect(screen.element.hidden).toBe(true);
    screen.show({ lap: 2, laps: 3, timeMs: 84360 });
    expect(screen.element.hidden).toBe(false);
    expect(screen.element.querySelector('.ui-hatch')).not.toBeNull();
    const card = screen.element.querySelector('[role="dialog"]');
    const header = card?.firstElementChild;
    expect(header?.textContent).toContain('Paused');
    expect(header?.textContent).toContain('LAP 2/3 · 1:24.36');
    const stripes = header?.nextElementSibling;
    expect(stripes?.classList.contains('ui-stripes')).toBe(true);
    expect(stripes?.querySelectorAll('.ui-stripe')).toHaveLength(3);
  });

  it('AC2: the lap/time line matches the HUD, and reads 0:00.00 during the countdown', () => {
    const ui = createRaceUi(document.body, { onRaceAgain: vi.fn() });
    ui.reset(3, outline, ['rally-red', 'mustard']);
    const cars = [car(0), car(10)];
    const header = (): string => document.querySelector('.ui-pause [role="dialog"]')?.firstElementChild?.textContent ?? '';
    ui.sync({ phase: 'countdown', countdown: 2, raceTick: 0, racers: [racer(), racer()] } satisfies RaceView, cars);
    ui.pause();
    expect(header()).toContain('LAP 1/3 · 0:00.00');
    ui.resume();
    ui.sync({ phase: 'racing', countdown: 0, raceTick: 5061, racers: [racer({ lap: 2, lapsCompleted: 1, lapTicks: [2500] }), racer()] }, cars);
    ui.pause();
    const hudTime = document.querySelector('.ui-hud-time .ui-value')?.textContent;
    expect(hudTime).toBe('1:24.35');
    expect(header()).toContain(`LAP 2/3 · ${hudTime}`);
  });

  it('AC3: three buttons Resume (primary), Restart race (cream), Quit to menu (navy); Resume is focused', () => {
    const screen = createPauseScreen(document.body, { onResume: vi.fn(), onRestart: vi.fn(), onQuit: vi.fn() });
    screen.show({ lap: 1, laps: 3, timeMs: null });
    const buttons = [...screen.element.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Resume', 'Restart race', 'Quit to menu']);
    expect(buttons[0]?.classList.contains('ui-button--primary')).toBe(true);
    expect(buttons[1]?.className.trim()).toBe('ui-button');
    expect(buttons[2]?.classList.contains('ui-button--navy')).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('AC4: Esc pauses a race; frames then change nothing, even in the countdown; Esc again resumes', () => {
    const { game } = setup();
    esc();
    expect(game.state().paused).toBe(false);
    expect(game.state().mode).toBe('menu');

    game.startRace({ seed: 2 });
    runFrames(10);
    expect(game.state().race?.phase).toBe('countdown');
    esc();
    expect(game.state().paused).toBe(true);
    const before = game.state();
    runFrames(120);
    expect(game.state().race?.raceTick).toBe(before.race?.raceTick);
    expect(game.state().cars).toEqual(before.cars);
    expect(game.state().race).toEqual(before.race);
    esc();
    expect(game.state().paused).toBe(false);

    toRacing(game);
    runFrames(30);
    esc();
    const racing = game.state();
    runFrames(200);
    expect(game.state().race?.raceTick).toBe(racing.race?.raceTick);
    expect(game.state().cars).toEqual(racing.cars);
    esc();
    expect(game.state().paused).toBe(false);
  });

  it('AC5: resume (button or Esc) restores the paused state exactly; the first frame steps at most 1 tick', () => {
    const { game, q } = setup();
    game.startRace({ seed: 3 });
    toRacing(game);
    runFrames(20);
    for (const resume of [() => q('.ui-pause button')?.click(), esc]) {
      esc();
      const snap = game.state();
      expect(snap.paused).toBe(true);
      runFrames(500);
      resume();
      expect(game.state()).toEqual({ ...snap, paused: false });
      const tick = snap.race?.raceTick ?? 0;
      runFrames(1);
      expect((game.state().race?.raceTick ?? 0) - tick).toBeLessThanOrEqual(1);
      runFrames(10);
    }
  });

  it('AC6: resuming wakes touch controls that had gone to resting', () => {
    const ui = createRaceUi(document.body, { onRaceAgain: vi.fn() });
    ui.reset(3, outline, ['rally-red', 'mustard']);
    ui.sync({ phase: 'racing', countdown: 0, raceTick: 0, racers: [racer(), racer()] }, [car(0), car(10)]);
    expect(ui.touch.machine.state('gas')).toBe('active');
    clock += 10_000;
    expect(ui.touch.machine.state('gas')).toBe('resting');
    ui.pause();
    ui.resume();
    expect(ui.touch.machine.state('gas')).toBe('active');
    expect(ui.touch.machine.state('left')).toBe('active');
  });

  it('AC6: in a running game, resume from the pause card wakes the touch controls', () => {
    const { game, q } = setup();
    game.startRace({ seed: 4 });
    toRacing(game);
    clock += 10_000;
    esc();
    q('.ui-pause button')?.click();
    expect(game.state().paused).toBe(false);
    expect(q('.ui-tc--gas')?.classList.contains('is-active')).toBe(true);
  });

  it('AC7: Restart race starts a fresh countdown on the same track and hides the overlay', () => {
    const { game, q } = setup();
    game.startRace({ trackId: 'dust-bowl', seed: 5 });
    toRacing(game);
    runFrames(30);
    esc();
    const restart = [...(q('.ui-pause')?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Restart race');
    restart?.click();
    const st = game.state();
    expect(st.trackId).toBe('dust-bowl');
    expect(st.race?.phase).toBe('countdown');
    expect(st.race?.raceTick).toBe(0);
    expect(st.paused).toBe(false);
    expect(pauseOverlay(q)?.hidden).toBe(true);
  });

  it('AC8: Quit to menu returns to the start screen and hides the race layer and overlay', () => {
    const { game, q } = setup();
    game.startRace({ seed: 6 });
    runFrames(5);
    esc();
    const quit = [...(q('.ui-pause')?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Quit to menu');
    quit?.click();
    const st = game.state();
    expect(st.mode).toBe('menu');
    expect(st.paused).toBe(false);
    expect(q('.ui-start')?.hidden).toBe(false);
    expect(q('.race-layer')?.hidden).toBe(true);
    expect(pauseOverlay(q)?.hidden).toBe(true);
  });
});
