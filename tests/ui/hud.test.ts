// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createHud } from '../../src/ui/hud.ts';
import type { HudState } from '../../src/ui/types.ts';
import { hudState as sample, outline } from './helpers.ts';

const text = (sel: string): string => document.querySelector(sel)?.textContent ?? '';
const dots = (): Element[] => [...document.querySelectorAll('.ui-hud-map circle')];
/** The same values in new objects, as the game loop builds them every frame. */
const copy = (s: HudState): HudState => ({ ...s, minimap: { outline: s.minimap.outline, cars: s.minimap.cars.map((c) => ({ ...c })) } });

describe('race HUD', () => {
  it('renders POS, LAP, TIME and BEST', () => {
    const hud = createHud(document.body);
    hud.update(sample());
    expect(text('.ui-hud-pos__n')).toBe('2');
    expect(text('.ui-hud-pos__of')).toBe('/6');
    expect(text('.ui-hud-pos')).toContain('Pos');
    expect(text('.ui-hud-lap .ui-value')).toBe('1/3');
    expect(text('.ui-hud-time .ui-value')).toBe('0:06.12');
    expect(text('.ui-hud-best__value')).toBe('–:––.––');
  });

  it('shows 0:00.00 before GO', () => {
    const hud = createHud(document.body);
    hud.update(sample({ timeMs: null }));
    expect(text('.ui-hud-time .ui-value')).toBe('0:00.00');
  });

  it('updates changed values', () => {
    const hud = createHud(document.body);
    hud.update(sample());
    hud.update(sample({ position: 1, lap: 2, timeMs: 84360, bestLapMs: 41020 }));
    expect(text('.ui-hud-pos__n')).toBe('1');
    expect(text('.ui-hud-lap .ui-value')).toBe('2/3');
    expect(text('.ui-hud-time .ui-value')).toBe('1:24.36');
    expect(text('.ui-hud-best__value')).toBe('0:41.02');
  });

  it('writes nothing to the DOM for an unchanged state, and only the changed text node otherwise', () => {
    const hud = createHud(document.body);
    const state = sample();
    hud.update(state);
    const obs = new MutationObserver(() => {});
    obs.observe(hud.element, { subtree: true, childList: true, characterData: true, attributes: true });
    hud.update(copy(state));
    hud.update(copy(state));
    expect(obs.takeRecords()).toHaveLength(0);
    hud.update({ ...copy(state), timeMs: 6130 });
    expect(obs.takeRecords().map((r) => [r.type, r.target.textContent])).toEqual([['characterData', '0:06.13']]);
    obs.disconnect();
  });

  it('draws the minimap outline and one dot per car, player last and larger', () => {
    const hud = createHud(document.body);
    hud.update(sample());
    const paths = document.querySelectorAll('.ui-hud-map path');
    expect(paths).toHaveLength(2);
    expect(paths[0]?.getAttribute('d')).toMatch(/^M.*Z$/);
    const [first, , last] = dots();
    expect(dots()).toHaveLength(3);
    expect(last?.classList.contains('ui-hud-map__car--rally-red')).toBe(true);
    expect(Number(last?.getAttribute('r'))).toBeGreaterThan(Number(first?.getAttribute('r')));
    expect(first?.classList.contains('ui-hud-map__car--mustard')).toBe(true);
  });

  it('fits the outline inside the 98×66 map with north up', () => {
    const hud = createHud(document.body);
    hud.update(sample());
    for (const d of dots()) {
      const cx = Number(d.getAttribute('cx'));
      const cy = Number(d.getAttribute('cy'));
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(98);
      expect(cy).toBeGreaterThanOrEqual(0);
      expect(cy).toBeLessThanOrEqual(66);
    }
    // The mustard car at z = −10 is the northernmost point: smallest y.
    const [mustard, , player] = dots();
    expect(Number(mustard?.getAttribute('cy'))).toBeLessThan(Number(player?.getAttribute('cy')));
  });

  it('moves the same dots as cars move, and rebuilds them for a new car count or outline', () => {
    const hud = createHud(document.body);
    const s = sample();
    hud.update(s);
    const before = dots();
    const cx = Number(before[2]?.getAttribute('cx'));
    hud.update({ ...s, minimap: { outline, cars: s.minimap.cars.map((c) => (c.player ? { ...c, x: 60 } : c)) } });
    expect(dots().every((d, i) => d === before[i])).toBe(true);
    expect(Number(dots()[2]?.getAttribute('cx'))).toBeGreaterThan(cx);

    hud.update({ ...s, minimap: { outline, cars: s.minimap.cars.slice(0, 2) } });
    expect(dots()).toHaveLength(2);
    const two = dots();
    hud.update({ ...s, minimap: { outline: [...outline], cars: s.minimap.cars.slice(0, 2) } });
    expect(dots()[0]).not.toBe(two[0]);
  });
});
