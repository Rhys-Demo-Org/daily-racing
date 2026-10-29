// @vitest-environment happy-dom
// Colours come only from token CSS variables via classes: no inline style or SVG attribute in the
// UI's DOM may set a colour.
import { describe, expect, it } from 'vitest';
import { createCountdown } from '../../src/ui/countdown.ts';
import { createFinishPanel } from '../../src/ui/finish-panel.ts';
import { createHud } from '../../src/ui/hud.ts';
import { createStartScreen } from '../../src/ui/start-screen.ts';
import { createTouchControls } from '../../src/ui/touch-controls.ts';

const COLOUR_PROPS = /(^|;|\s)(color|background|background-color|fill|stroke|border|border-color|outline|outline-color|box-shadow)\s*:/i;
const COLOUR_VALUE = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i;
const PAINT_ATTRS = ['fill', 'stroke', 'color', 'stop-color', 'flood-color', 'lighting-color', 'bgcolor'];

describe('UI DOM', () => {
  it('sets no colour in any inline style or SVG paint attribute', () => {
    document.body.replaceChildren();
    const root = document.body;
    createHud(root).update({
      position: 2,
      carCount: 6,
      lap: 1,
      laps: 3,
      timeMs: 6120,
      bestLapMs: 40370,
      minimap: {
        outline: [
          [0, 0],
          [10, 0],
          [10, 5],
        ],
        cars: [
          { x: 0, z: 0, colour: 'teal', player: false },
          { x: 1, z: 1, colour: 'rally-red', player: true },
        ],
      },
    });
    const tc = createTouchControls(root, { visible: true });
    tc.wake();
    tc.machine.press('gas');
    const cd = createCountdown(root);
    cd.show(2);
    createStartScreen(root, { onRace: () => {} }).show();
    createFinishPanel(root, { onRaceAgain: () => {} }).show({ timeMs: 1, bestLapMs: null });

    const all = [...root.querySelectorAll('*')];
    expect(all.length).toBeGreaterThan(40);
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
  });
});
