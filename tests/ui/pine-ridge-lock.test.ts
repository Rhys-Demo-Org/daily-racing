// @vitest-environment happy-dom
// B11 · The game's track select with empty storage: Pine Ridge is a locked card (S6) that can't be
// picked by click or arrow keys, shows a padlock and no best.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PINE, card, cards, checked, padlock, setup } from '../game/pine-ridge-helpers.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
}));

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});

const key = (el: HTMLElement, k: string): boolean => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('B11 locked Pine Ridge card', () => {
  it('AC5: with empty storage the Pine Ridge radio is aria-disabled with a "Locked" padlock', () => {
    const { root } = setup();
    const pine = card(root, PINE);
    expect(pine.getAttribute('aria-disabled')).toBe('true');
    expect(padlock(pine)).not.toBeNull();
    expect(pine.getAttribute('aria-checked')).toBe('false');
    // The other cards are not locked.
    for (const name of ['Bramble Bends', 'Dust Bowl', 'Hay Loop']) {
      expect(card(root, name).getAttribute('aria-disabled')).toBeNull();
      expect(padlock(card(root, name))).toBeNull();
    }
  });

  it('AC5: a locked card shows no best, even with one stored', () => {
    localStorage.setItem('racer.bestLap.pine-ridge', '61230');
    const { root } = setup();
    expect(card(root, PINE).textContent).toContain('BEST –:––.––');
    expect(card(root, PINE).textContent).not.toContain('1:01.23');
  });

  it('AC5: clicking Pine Ridge leaves Bramble Bends selected', () => {
    const { root } = setup();
    expect(checked(root)).toContain('Bramble Bends');
    card(root, PINE).click();
    expect(checked(root)).toContain('Bramble Bends');
    expect(card(root, PINE).getAttribute('aria-checked')).toBe('false');
  });

  it('AC5: arrows skip it: from Hay Loop ArrowRight wraps to Bramble Bends and ArrowLeft returns to Hay Loop', () => {
    const { root } = setup();
    // Pine Ridge is the fourth, last card, locked.
    expect(cards(root).map((c) => c.textContent?.includes(PINE))).toEqual([false, false, false, true]);
    expect(card(root, PINE).getAttribute('aria-disabled')).toBe('true');
    card(root, 'Hay Loop').click();
    expect(checked(root)).toContain('Hay Loop');
    key(card(root, 'Hay Loop'), 'ArrowRight');
    expect(checked(root)).toContain('Bramble Bends');
    expect(document.activeElement).toBe(card(root, 'Bramble Bends'));
    key(card(root, 'Bramble Bends'), 'ArrowLeft');
    expect(checked(root)).toContain('Hay Loop');
  });
});
