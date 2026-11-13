// @vitest-environment happy-dom
// B08 · Track select on the start screen (S6): one radio card per registered track with its outline,
// name and stored best; one selected, arrows move the selection. Driven through the game's menu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKS } from '../../src/content/tracks.ts';
import { createGame } from '../../src/game.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});

function menu(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  createGame(root);
  return root;
}

const group = (root: HTMLElement): HTMLElement | null => root.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Select track"]');
const cards = (root: HTMLElement): HTMLElement[] => [...(group(root)?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])];
const card = (root: HTMLElement, name: string): HTMLElement | undefined => cards(root).find((c) => c.textContent?.includes(name));
const checked = (root: HTMLElement): string[] => cards(root).filter((c) => c.getAttribute('aria-checked') === 'true').map((c) => c.textContent ?? '');
const key = (el: HTMLElement, k: string): boolean => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('B08 track select', () => {
  it('AC1: SELECT TRACK and a "Select track" radiogroup with one card per registered track, in order, each with its name and a drawn outline', () => {
    const root = menu();
    expect(root.textContent).toContain('SELECT TRACK');
    expect(group(root)).not.toBeNull();
    const all = cards(root);
    expect(all).toHaveLength(TRACKS.length);
    TRACKS.forEach((track, i) => {
      const c = all[i] as HTMLElement;
      expect(c.textContent).toContain(track.name);
      const path = c.querySelector('svg path');
      expect(path?.getAttribute('d') ?? '').toMatch(/^M[\d.\s-]+L/);
    });
    // Cards are not buttons: RACE stays the menu's first button.
    expect(root.querySelector('.ui-start button')?.textContent).toBe('Race');
  });

  it('AC2: each card shows its stored best, or dashes for none or an invalid value', () => {
    const [first, second, third] = TRACKS;
    if (!first || !second || !third) throw new Error('needs three tracks');
    localStorage.setItem(`racer.bestLap.${first.id}`, '40370');
    localStorage.setItem(`racer.bestLap.${second.id}`, 'fast');
    const root = menu();
    expect(card(root, first.name)?.textContent).toContain('BEST 0:40.37');
    expect(card(root, second.name)?.textContent).toContain('BEST –:––.––');
    expect(card(root, third.name)?.textContent).toContain('BEST –:––.––');
  });

  it('AC2: with storage throwing, every card shows dashes and the menu still renders', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const root = menu();
    const all = cards(root);
    expect(all).toHaveLength(TRACKS.length);
    for (const c of all) expect(c.textContent).toContain('BEST –:––.––');
    expect(root.querySelector<HTMLElement>('.ui-start')?.hidden).toBe(false);
  });

  it('AC3: the first track starts selected; a click moves the selection', () => {
    const root = menu();
    const [first, second] = TRACKS;
    if (!first || !second) throw new Error('needs two tracks');
    expect(checked(root)).toHaveLength(1);
    expect(checked(root)[0]).toContain(first.name);
    card(root, second.name)?.click();
    expect(checked(root)).toHaveLength(1);
    expect(checked(root)[0]).toContain(second.name);
    expect(card(root, first.name)?.getAttribute('aria-checked')).toBe('false');
  });

  it('AC3: ArrowRight/ArrowLeft on a focused card move the selection, wrapping at the ends', () => {
    const root = menu();
    const names = TRACKS.map((t) => t.name);
    const first = card(root, names[0] ?? '') as HTMLElement;
    first.focus();
    key(first, 'ArrowLeft');
    expect(checked(root)[0]).toContain(names[names.length - 1]);
    expect(document.activeElement?.getAttribute('aria-checked')).toBe('true');
    key(document.activeElement as HTMLElement, 'ArrowRight');
    expect(checked(root)[0]).toContain(names[0]);
    key(document.activeElement as HTMLElement, 'ArrowRight');
    expect(checked(root)[0]).toContain(names[1]);
    key(document.activeElement as HTMLElement, 'ArrowLeft');
    expect(checked(root)[0]).toContain(names[0]);
    expect(checked(root)).toHaveLength(1);
  });
});
