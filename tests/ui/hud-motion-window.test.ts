// B09 finding R5-1: the bump, roll and stamp stay on for the whole 160ms move (10 race ticks), not
// just the event tick. Synced every tick as the game does, 9 ticks after the overtake and the new
// lap the Pos panel, its digit and the Lap panel still animate; AC4 shows them at rest at 10.
import { describe, expect, it } from 'vitest';
import { probe, setup, stage, type Target } from './hud-motion.ts';

const env = setup();
const POS: Target = { label: 'Pos' };
const DIGIT: Target = { digitIn: 'Pos', text: '2' };
const LAP: Target = { label: 'Lap' };

describe('B09 HUD event motion window', () => {
  it('AC4: 9 race ticks after an overtake, synced every tick, the Pos panel and digit still animate', async () => {
    const page = await stage(env.browser(), env.origin(), 'overtake-late');
    const [pos, digit] = await probe(page, [POS, DIGIT]);
    expect(pos?.name).not.toBeNull();
    expect(digit?.name).not.toBeNull();
    await page.context().close();
  }, 60_000);

  it('AC4: 9 race ticks after a new lap, synced every tick, the Lap panel still stamps', async () => {
    const page = await stage(env.browser(), env.origin(), 'new-lap-late');
    const [lap] = await probe(page, [LAP]);
    expect(lap?.name).not.toBeNull();
    await page.context().close();
  }, 60_000);
});
