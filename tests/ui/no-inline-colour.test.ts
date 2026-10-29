// @vitest-environment happy-dom
// Colours come only from token CSS variables via classes: no inline style or SVG attribute in the
// UI's DOM may set a colour.
import { describe, expect, it } from 'vitest';
import { createCountdown } from '../../src/ui/countdown.ts';
import { createFinishPanel } from '../../src/ui/finish-panel.ts';
import { createHud } from '../../src/ui/hud.ts';
import { createStartScreen } from '../../src/ui/start-screen.ts';
import { createTouchControls } from '../../src/ui/touch-controls.ts';
import { hudState } from './helpers.ts';

const COLOUR_PROPS = /(^|;|\s)(color|background|background-color|fill|stroke|border|border-color|outline|outline-color|box-shadow)\s*:/i;
const COLOUR_VALUE = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i;
const PAINT_ATTRS = ['fill', 'stroke', 'color', 'stop-color', 'flood-color', 'lighting-color', 'bgcolor'];

describe('UI DOM', () => {
  it('sets no colour in any inline style or SVG paint attribute', () => {
    const root = document.body;
    createHud(root).update(hudState({ bestLapMs: 40370 }));
    const tc = createTouchControls(root);
    tc.wake();
    tc.machine.press('gas');
    createCountdown(root).show(2);
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
