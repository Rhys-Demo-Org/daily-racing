// B09: with reduced motion (UI_RULES §7) the HUD's event and entry motion is cut, while the events
// still show and a held touch control still sinks. The same stages without reduced motion do
// animate, so it is the media query that removes the motion. Rendered in Chromium at 844×390.
import type { Page } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { AT_REST, ENTERING, panelValue, probe, setup, stage, type Target } from './hud-motion.ts';

const env = setup();
const EVENTS: Target[] = [{ label: 'Pos' }, { digitIn: 'Pos', text: '2' }, { label: 'Lap' }];

const countdownShowing = (page: Page): Promise<boolean> =>
  page.evaluate(() => [...document.querySelectorAll('body *')].some((e) => e.children.length === 0 && e.textContent?.trim() === '3' && e.getClientRects().length > 0));

describe('B09 reduced motion', () => {
  it('AC7: under reduced motion the events show but nothing bumps, rolls, stamps or slides in', async () => {
    for (const motion of ['reduce', 'no-preference'] as const) {
      const cut = motion === 'reduce';
      const overtake = await stage(env.browser(), env.origin(), 'overtake', motion);
      expect(await panelValue(overtake, 'Pos')).toMatch(/^2\//);
      const [pos, digit] = await probe(overtake, EVENTS.slice(0, 2));
      expect(cut ? [pos, digit] : [pos?.name, digit?.name].includes(null), motion).toEqual(cut ? [AT_REST, AT_REST] : false);
      await overtake.context().close();

      const lapPage = await stage(env.browser(), env.origin(), 'new-lap', motion);
      expect(await panelValue(lapPage, 'Lap')).toBe('2/3');
      const [lap] = await probe(lapPage, EVENTS.slice(2));
      expect(cut ? lap : lap?.name === null, motion).toEqual(cut ? AT_REST : false);
      await lapPage.context().close();

      const entry = await stage(env.browser(), env.origin(), 'entry', motion);
      expect(await countdownShowing(entry)).toBe(true);
      const entering = await probe(entry, ENTERING);
      if (cut) expect(entering).toEqual(Array(ENTERING.length).fill(AT_REST));
      else expect(entering.every((m) => m.name !== null)).toBe(true);
      await entry.context().close();
    }
  }, 120_000);

  it('AC7: under reduced motion a held Accelerate still sinks', async () => {
    const page = await stage(env.browser(), env.origin(), 'overtake', 'reduce');
    const gas = page.getByRole('button', { name: 'Accelerate' });
    const box = await gas.boundingBox();
    if (!box) throw new Error('Accelerate is not shown');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => gas.evaluate((el) => getComputedStyle(el).transform), { timeout: 5000 }).toMatch(/^matrix\(1, 0, 0, 1, [1-9]/);
    await page.mouse.up();
    await page.context().close();
  }, 60_000);
});
