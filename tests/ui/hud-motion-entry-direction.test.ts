// B09: race entry direction (board 05 #9). The top-corner HUD panels slide down from above and the
// touch controls slide up from below: the first keyframe of each entering element's animation is
// translated by a negative Y for HUD panels and a positive Y for touch controls.
import type { Page } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { ENTERING, setup, stage, type Target } from './hud-motion.ts';

const env = setup();

/** The Y offset (px) of the first keyframe of the animation on each target or its nearest animated wrapper. */
function startY(page: Page, targets: Target[]): Promise<(number | null)[]> {
  return page.evaluate((ts) => {
    const all = [...document.querySelectorAll<HTMLElement>('body *')];
    const ownText = (el: Element): string =>
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
    return ts.map((t) => {
      let el: Element | null | undefined;
      if ('label' in t) el = all.find((e) => ownText(e).toLowerCase() === t.label.toLowerCase())?.parentElement;
      else if ('name' in t) el = all.find((e) => e.getAttribute('aria-label') === t.name);
      if (!el) throw new Error(`not found: ${JSON.stringify(t)}`);
      for (let e: Element | null = el; e && e.id !== 'app'; e = e.parentElement) {
        const anim = e.getAnimations()[0];
        if (!(anim?.effect instanceof KeyframeEffect)) continue;
        const first = anim.effect.getKeyframes()[0];
        const transform = typeof first?.transform === 'string' ? first.transform : 'none';
        // Resolve the keyframe's transform (e.g. vh units) to pixels on an unanimated probe.
        const probe = document.createElement('div');
        probe.style.transform = transform;
        document.body.append(probe);
        const y = new DOMMatrix(getComputedStyle(probe).transform).m42;
        probe.remove();
        return y;
      }
      return null;
    });
  }, targets);
}

describe('B09 race entry direction', () => {
  it('AC5: HUD panels slide down from above and touch controls slide up from below', async () => {
    const page = await stage(env.browser(), env.origin(), 'entry');
    const ys = await startY(page, ENTERING);
    ys.forEach((y, i) => {
      const what = JSON.stringify(ENTERING[i]);
      expect(y, what).not.toBeNull();
      if (i < 5) expect(y, what).toBeLessThan(0);
      else expect(y, what).toBeGreaterThan(0);
    });
    await page.context().close();
  }, 60_000);
});
