// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createCountdown } from '../../src/ui/countdown.ts';

afterEach(() => {
  document.body.replaceChildren();
});

const roundel = (): HTMLElement | null => document.querySelector('.ui-cd-roundel');
const lit = (): number => document.querySelectorAll('.ui-cd-light.is-lit').length;

describe('countdown', () => {
  it('is hidden until shown', () => {
    const cd = createCountdown(document.body);
    expect(cd.element.hidden).toBe(true);
    expect(cd.current).toBeNull();
  });

  it('runs 3, 2, 1, GO with the right roundel and one more light per beat', () => {
    const cd = createCountdown(document.body);
    const seen: [string, string, number][] = [];
    for (const step of [3, 2, 1, 0] as const) {
      cd.show(step);
      const r = roundel();
      const kind = [...(r?.classList ?? [])].find((c) => c.startsWith('ui-cd-roundel--')) ?? '';
      seen.push([r?.textContent ?? '', kind, lit()]);
    }
    expect(seen).toEqual([
      ['3', 'ui-cd-roundel--3', 1],
      ['2', 'ui-cd-roundel--2', 2],
      ['1', 'ui-cd-roundel--1', 3],
      ['Go!', 'ui-cd-roundel--go', 4],
    ]);
    expect(cd.element.classList.contains('is-go')).toBe(true);
    expect(cd.element.hidden).toBe(false);
  });

  it('drops a fresh roundel on each beat and ignores repeats of the same step', () => {
    const cd = createCountdown(document.body);
    cd.show(3);
    const first = roundel();
    cd.show(3);
    expect(roundel()).toBe(first);
    cd.show(2);
    expect(roundel()).not.toBe(first);
    expect(document.querySelectorAll('.ui-cd-roundel')).toHaveLength(1);
  });

  it('pops only the newly lit light', () => {
    const cd = createCountdown(document.body);
    cd.show(3);
    cd.show(2);
    const popping = [...document.querySelectorAll('.ui-cd-light.is-popping')];
    expect(popping).toHaveLength(1);
    expect(popping[0]?.classList.contains('ui-cd-light--1')).toBe(true);
  });

  it('hide() clears everything and the sequence can run again', () => {
    const cd = createCountdown(document.body);
    cd.show(3);
    cd.show(0);
    cd.hide();
    expect(cd.element.hidden).toBe(true);
    expect(roundel()).toBeNull();
    expect(lit()).toBe(0);
    cd.show(3);
    expect(roundel()?.textContent).toBe('3');
    expect(lit()).toBe(1);
  });
});
