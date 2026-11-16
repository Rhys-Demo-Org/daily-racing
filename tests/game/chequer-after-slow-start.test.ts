// @vitest-environment happy-dom
// R2-1: the chequer band's removal timer must start after the synchronous race start, so a slow
// scene build does not cut the sweep short.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGame } from '../../src/game.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  // Building the scene takes 300ms of wall time (simulated with fake timers).
  createRaceScene: () => {
    vi.advanceTimersByTime(300);
    return { update() {}, render() {}, reset() {}, resize() {}, dispose() {} };
  },
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('matchMedia', (media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('R2-1: the chequer band stays on show for the full wipe after a slow race start returns', () => {
  const root = document.createElement('div');
  document.body.append(root);
  const game = createGame(root);
  game.freeze();
  const race = [...root.querySelectorAll('.ui-start button')].find((b) => b.textContent === 'Race');
  expect(race).toBeDefined();
  race?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(game.state().mode).toBe('race');
  vi.advanceTimersByTime(250);
  expect(root.querySelector('[data-screen-change="chequer"]')).not.toBeNull();
});
