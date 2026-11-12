// @vitest-environment happy-dom
// Colours come only from token CSS variables via classes: the pause and results screens (icons,
// stripes and the hatch) set no colour in any inline style or SVG paint attribute.
import { describe, expect, it } from 'vitest';
import type { CarView, RaceView, RacerView } from '../../src/sim/types.ts';
import { createPauseScreen } from '../../src/ui/pause-screen.ts';
import { createRaceUi } from '../../src/ui/race-ui.ts';
import { outline } from './helpers.ts';

const COLOUR_PROPS = /(^|;|\s)(color|background|background-color|fill|stroke|border|border-color|outline|outline-color|box-shadow)\s*:/i;
const COLOUR_VALUE = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i;
const PAINT_ATTRS = ['fill', 'stroke', 'color', 'stop-color', 'flood-color', 'lighting-color', 'bgcolor'];

const car = (x: number): CarView => ({ x, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false });
const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });

function expectNoInlineColour(root: Element): void {
  const all = [...root.querySelectorAll('*')];
  expect(all.length).toBeGreaterThan(10);
  for (const el of all) {
    const style = el.getAttribute('style') ?? '';
    expect(style, el.outerHTML.slice(0, 80)).not.toMatch(COLOUR_PROPS);
    expect(style, el.outerHTML.slice(0, 80)).not.toMatch(COLOUR_VALUE);
    for (const attr of PAINT_ATTRS) {
      const v = el.getAttribute(attr);
      // The only paint attribute allowed is a reference to a pattern (the hatch).
      if (v !== null) expect(v, `${el.tagName} ${attr}`).toMatch(/^url\(#[\w-]+\)$/);
    }
  }
}

describe('overlay screens DOM', () => {
  it('pause screen sets no colour in any inline style or SVG paint attribute', () => {
    document.body.replaceChildren();
    createPauseScreen(document.body, { onResume: () => {}, onRestart: () => {}, onQuit: () => {} }).show({ lap: 1, laps: 3, timeMs: 0 });
    const screen = document.querySelector('.ui-pause');
    expect(screen).not.toBeNull();
    expect((screen as HTMLElement).hidden).toBe(false);
    expectNoInlineColour(screen as Element);
  });

  it('results screen sets no colour in any inline style or SVG paint attribute', () => {
    document.body.replaceChildren();
    const ui = createRaceUi(document.body, { onRaceAgain: () => {}, onNextRace: () => {} });
    ui.reset(3, outline, ['rally-red', 'mustard'], { trackName: 'Dust Bowl', carNumbers: [1, 7] });
    const view: RaceView = {
      phase: 'finished',
      countdown: 0,
      raceTick: 8000,
      racers: [racer({ lapTicks: [2500, 2400, 2300], finishTick: 7200, lap: 3 }), racer({ finishTick: 7500, position: 2 })],
    };
    ui.sync(view, [car(0), car(10)]);
    const screen = document.querySelector('.ui-results');
    expect(screen).not.toBeNull();
    expect((screen as HTMLElement).hidden).toBe(false);
    expectNoInlineColour(screen as Element);
  });
});
