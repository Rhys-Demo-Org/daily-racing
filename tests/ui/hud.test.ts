// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createHud } from '../../src/ui/hud.ts';
import type { HudState } from '../../src/ui/types.ts';

const outline: [number, number][] = [
  [0, 0],
  [40, -10],
  [80, 0],
  [70, 30],
  [10, 30],
];

function sample(over: Partial<HudState> = {}): HudState {
  return {
    position: 2,
    carCount: 6,
    lap: 1,
    laps: 3,
    timeMs: 6120,
    bestLapMs: null,
    minimap: {
      outline,
      cars: [
        { x: 0, z: 0, colour: 'rally-red', player: true },
        { x: 40, z: -10, colour: 'mustard', player: false },
        { x: 80, z: 0, colour: 'navy', player: false },
      ],
    },
    ...over,
  };
}

const text = (sel: string): string => document.querySelector(sel)?.textContent ?? '';

afterEach(() => {
  document.body.replaceChildren();
});

describe('race HUD', () => {
  it('renders POS, LAP, TIME and BEST', () => {
    const hud = createHud(document.body);
    hud.update(sample());
    expect(text('.ui-hud-pos__n')).toBe('2');
    expect(text('.ui-hud-pos__of')).toBe('/6');
    expect(text('.ui-hud-pos')).toContain('Pos');
    expect(text('.ui-hud-lap__value')).toBe('1/3');
    expect(text('.ui-hud-time__value')).toBe('0:06.12');
    expect(text('.ui-hud-best__value')).toBe('–:––.––');
  });

  it('shows 0:00.00 before GO', () => {
    const hud = createHud(document.body);
    hud.update(sample({ timeMs: null }));
    expect(text('.ui-hud-time__value')).toBe('0:00.00');
  });

  it('updates changed values', () => {
    const hud = createHud(document.body);
    hud.update(sample());
    hud.update(sample({ position: 1, lap: 2, timeMs: 84360, bestLapMs: 41020 }));
    expect(text('.ui-hud-pos__n')).toBe('1');
    expect(text('.ui-hud-lap__value')).toBe('2/3');
    expect(text('.ui-hud-time__value')).toBe('1:24.36');
    expect(text('.ui-hud-best__value')).toBe('0:41.02');
  });

  it('does not touch the DOM when nothing changed', () => {
    const hud = createHud(document.body);
    const state = sample();
    hud.update(state);
    const mutations: MutationRecord[] = [];
    const obs = new MutationObserver((m) => mutations.push(...m));
    obs.observe(hud.element, { subtree: true, childList: true, characterData: true, attributes: true });
    hud.update({ ...state });
    hud.update({ ...state });
    expect(obs.takeRecords().concat(mutations)).toHaveLength(0);
    obs.disconnect();
  });

  it('draws the minimap outline and one dot per car, player last and larger', () => {
    const hud = createHud(document.body);
    hud.update(sample());
    const paths = document.querySelectorAll('.ui-hud-map path');
    expect(paths).toHaveLength(2);
    expect(paths[0]?.getAttribute('d')).toMatch(/^M.*Z$/);
    const dots = [...document.querySelectorAll('.ui-hud-map circle')];
    expect(dots).toHaveLength(3);
    const last = dots[2];
    expect(last?.classList.contains('ui-hud-map__car--player')).toBe(true);
    expect(last?.classList.contains('ui-hud-map__car--rally-red')).toBe(true);
    expect(Number(last?.getAttribute('r'))).toBeGreaterThan(Number(dots[0]?.getAttribute('r')));
    expect(dots[0]?.classList.contains('ui-hud-map__car--mustard')).toBe(true);
  });

  it('fits the outline inside the 98×66 map with north up', () => {
    const hud = createHud(document.body);
    hud.update(sample());
    const dots = [...document.querySelectorAll('.ui-hud-map circle')];
    for (const d of dots) {
      const cx = Number(d.getAttribute('cx'));
      const cy = Number(d.getAttribute('cy'));
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(98);
      expect(cy).toBeGreaterThanOrEqual(0);
      expect(cy).toBeLessThanOrEqual(66);
    }
    // The mustard car at z = −10 is the northernmost point: smallest y.
    const mustardY = Number(dots[0]?.getAttribute('cy'));
    const playerY = Number(dots[2]?.getAttribute('cy'));
    expect(mustardY).toBeLessThan(playerY);
  });

  it('moves dots as cars move', () => {
    const hud = createHud(document.body);
    hud.update(sample());
    const before = document.querySelectorAll('.ui-hud-map circle')[2]?.getAttribute('cx');
    const s = sample();
    hud.update({ ...s, minimap: { outline, cars: s.minimap.cars.map((c) => (c.player ? { ...c, x: 60 } : c)) } });
    const after = document.querySelectorAll('.ui-hud-map circle')[2]?.getAttribute('cx');
    expect(Number(after)).toBeGreaterThan(Number(before));
  });

  it('can be hidden and destroyed', () => {
    const hud = createHud(document.body);
    hud.setVisible(false);
    expect(hud.element.hidden).toBe(true);
    hud.destroy();
    expect(document.querySelector('.ui-hud')).toBeNull();
  });
});
