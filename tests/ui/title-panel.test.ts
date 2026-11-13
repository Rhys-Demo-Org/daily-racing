// @vitest-environment happy-dom
// B08 · The S6 title panel: DAILY AI RACER, the triple stripe and the player's #1 car.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/game.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('B08 title panel', () => {
  it('AC6: the panel holding the heading also holds the triple stripe and an SVG image of car #1', () => {
    const root = document.createElement('div');
    document.body.append(root);
    createGame(root);
    const heading = root.querySelector('h1');
    expect(heading?.textContent?.replace(/\s+/g, '').toUpperCase()).toBe('DAILYAIRACER');
    const panel = heading?.parentElement as HTMLElement;
    const stripes = [...panel.querySelectorAll('.ui-stripe')].map((s) => s.className);
    expect(stripes).toHaveLength(3);
    ['red', 'mustard', 'cream'].forEach((colour, i) => expect(stripes[i]).toContain(colour));
    const car = panel.querySelector('svg[role="img"]');
    expect(car?.getAttribute('aria-label')).toContain('#1');
    // It is drawn (body, cabin, roundel), not empty.
    expect(car?.querySelectorAll('rect, circle').length ?? 0).toBeGreaterThan(3);
    // The title panel is not the track-select ground: the cards sit elsewhere.
    expect(panel.querySelector('[role="radiogroup"]')).toBeNull();
  });
});
