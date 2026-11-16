// B09: HUD event motion (UI_RULES §7, board 05 #3). An overtake bumps the POS panel (stamp, 160ms)
// and rolls its digit (snap, 120ms); a new lap stamps the LAP panel (stamp, 160ms); nothing moves
// on a steady sync, and every move is over 10 race ticks later. Rendered in Chromium at 844×390.
import { describe, expect, it } from 'vitest';
import { AT_REST, panelValue, probe, setup, SNAP, STAMP, stage, type Target } from './hud-motion.ts';

const env = setup();
const POS: Target = { label: 'Pos' };
const DIGIT: Target = { digitIn: 'Pos', text: '2' };
const LAP: Target = { label: 'Lap' };

describe('B09 HUD event motion', () => {
  it('AC1: an overtake (P3 → P2 a tick apart) bumps the Pos panel and rolls its digit', async () => {
    const page = await stage(env.browser(), env.origin(), 'overtake');
    expect(await panelValue(page, 'Pos')).toMatch(/^2\//);
    const [pos, digit] = await probe(page, [POS, DIGIT]);
    expect(pos?.name).not.toBeNull();
    expect(pos).toMatchObject({ duration: '0.16s', timing: STAMP });
    expect(digit?.name).not.toBeNull();
    expect(digit).toMatchObject({ duration: '0.12s', timing: SNAP });
    expect(digit?.name).not.toBe(pos?.name);
    await page.context().close();
  }, 60_000);

  it('AC2: a first sync already racing at P2 on lap 2/3, or two equal syncs, moves nothing', async () => {
    for (const name of ['steady', 'steady-twice']) {
      const page = await stage(env.browser(), env.origin(), name);
      expect(await panelValue(page, 'Lap')).toBe('2/3');
      expect(await panelValue(page, 'Pos')).toMatch(/^2\//);
      expect(await probe(page, [POS, DIGIT, LAP]), name).toEqual([AT_REST, AT_REST, AT_REST]);
      await page.context().close();
    }
  }, 60_000);

  it('AC3: a new lap (1/3 → 2/3 a tick apart) stamps the Lap panel', async () => {
    const page = await stage(env.browser(), env.origin(), 'new-lap');
    expect(await panelValue(page, 'Lap')).toBe('2/3');
    const [lap] = await probe(page, [LAP]);
    expect(lap?.name).not.toBeNull();
    expect(lap).toMatchObject({ duration: '0.16s', timing: STAMP });
    await page.context().close();
  }, 60_000);

  it('AC4: 10 race ticks after the overtake and the new lap, nothing is animating', async () => {
    for (const name of ['overtake-done', 'new-lap-done']) {
      const page = await stage(env.browser(), env.origin(), name);
      expect(await probe(page, [POS, DIGIT, LAP]), name).toEqual([AT_REST, AT_REST, AT_REST]);
      await page.context().close();
    }
  }, 60_000);
});
