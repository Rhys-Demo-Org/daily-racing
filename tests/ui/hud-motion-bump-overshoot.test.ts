// R4-3: the Pos bump (board 05 #3) reaches ×1.12 and lands back at rest. UI_RULES §7 allows the
// stamp easing's one overshoot on the landing only, so the panel never grows past ×1.12.
import { describe, expect, it } from 'vitest';
import { setup, stage } from './hud-motion.ts';

const env = setup();

describe('B09 HUD event motion: Pos bump overshoot', () => {
  it('the Pos bump never scales past ×1.12, and overshoots at most once', async () => {
    const page = await stage(env.browser(), env.origin(), 'overtake');
    const scales = await page.evaluate(() => {
      const label = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && e.textContent?.trim().toLowerCase() === 'pos');
      const panel = label?.parentElement;
      if (!panel) throw new Error('no Pos panel');
      const [bump] = panel.getAnimations();
      if (!bump) throw new Error('Pos panel is not animating');
      bump.pause();
      const out: number[] = [];
      for (let t = 0; t <= 160; t += 2) {
        bump.currentTime = t;
        out.push(new DOMMatrixReadOnly(getComputedStyle(panel).transform).a);
      }
      return out;
    });
    const peak = 1.12;
    expect(Math.max(...scales)).toBeCloseTo(peak, 2);
    expect(Math.max(...scales)).toBeLessThanOrEqual(peak + 1e-3);
    // Count excursions outside [1, ×1.12]: the landing may dip below rest once, nothing else.
    let excursions = 0;
    let outside = false;
    for (const s of scales) {
      const now = s > peak + 1e-3 || s < 1 - 1e-3;
      if (now && !outside) excursions++;
      outside = now;
    }
    expect(excursions).toBeLessThanOrEqual(1);
    await page.context().close();
  }, 60_000);
});
