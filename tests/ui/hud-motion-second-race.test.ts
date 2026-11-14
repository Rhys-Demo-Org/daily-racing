// R5-2: the game resets one race UI for every race, so a reset must also forget the last race's
// position and lap. The first sync of a second race (P4 on lap 2/3, after race 1 left the player at
// P2 on lap 2) sets the baseline: the Pos panel, its digit and the Lap panel do not move.
import { describe, expect, it } from 'vitest';
import { AT_REST, panelValue, probe, setup, stage, type Target } from './hud-motion.ts';

const env = setup();
const POS: Target = { label: 'Pos' };
const DIGIT: Target = { digitIn: 'Pos', text: '4' };
const LAP: Target = { label: 'Lap' };

describe('R5-2: a second race on the same race UI', () => {
  it('its first sync is not an overtake or a new lap', async () => {
    const page = await stage(env.browser(), env.origin(), 'second-race');
    expect(await panelValue(page, 'Pos')).toMatch(/^4\//);
    expect(await panelValue(page, 'Lap')).toBe('2/3');
    expect(await probe(page, [POS, DIGIT, LAP])).toEqual([AT_REST, AT_REST, AT_REST]);
    await page.context().close();
  }, 60_000);
});
