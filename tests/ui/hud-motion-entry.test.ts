// B09: race entry (UI_RULES §7, board 05 #9). Just after a reset the HUD panels and then the touch
// controls slide in (200ms, snap) 40ms apart; once GO has passed a pause and resume replays
// nothing. Rendered in Chromium at 844×390.
import { describe, expect, it } from 'vitest';
import { AT_REST, ENTERING, probe, setup, SNAP, stage } from './hud-motion.ts';

const env = setup();

describe('B09 race entry', () => {
  it('AC5: after a reset the HUD panels, then the touch controls, slide in 40ms apart', async () => {
    const page = await stage(env.browser(), env.origin(), 'entry');
    const motions = await probe(page, ENTERING);
    motions.forEach((m, i) => {
      expect(m.name, JSON.stringify(ENTERING[i])).not.toBeNull();
      expect(m, JSON.stringify(ENTERING[i])).toMatchObject({ duration: '0.2s', timing: SNAP, delay: `${Math.round(i * 4) / 100}s` });
    });
    await page.context().close();
  }, 60_000);

  it('AC6: after GO, a pause and resume does not replay the entry', async () => {
    const page = await stage(env.browser(), env.origin(), 'resumed');
    expect(await probe(page, ENTERING.slice(0, 5))).toEqual(Array(5).fill(AT_REST));
    await page.context().close();
  }, 60_000);
});
