// B09 finding R5-3: a second overtake inside the first one's 160ms window restarts the bump and the
// roll. CSS only restarts an animation when its name changes, so the Pos panel and its digit must
// run a different keyframes name after P2 → P1 at tick 1205 than after P3 → P2 at tick 1201.
import { describe, expect, it } from 'vitest';
import { panelValue, probe, setup, SNAP, STAMP, stage, type Target } from './hud-motion.ts';

const env = setup();
const POS: Target = { label: 'Pos' };

describe('B09 HUD event motion restart', () => {
  it('AC1: a second overtake 4 ticks after the first restarts the Pos bump and digit roll', async () => {
    const first = await stage(env.browser(), env.origin(), 'overtake');
    const [pos1, digit1] = await probe(first, [POS, { digitIn: 'Pos', text: '2' }]);
    await first.context().close();

    const again = await stage(env.browser(), env.origin(), 'overtake-twice');
    expect(await panelValue(again, 'Pos')).toMatch(/^1\//);
    const [pos2, digit2] = await probe(again, [POS, { digitIn: 'Pos', text: '1' }]);
    await again.context().close();

    expect(pos2).toMatchObject({ duration: '0.16s', timing: STAMP });
    expect(digit2).toMatchObject({ duration: '0.12s', timing: SNAP });
    expect(pos2?.name).not.toBeNull();
    expect(digit2?.name).not.toBeNull();
    expect(pos2?.name).not.toBe(pos1?.name);
    expect(digit2?.name).not.toBe(digit1?.name);
  }, 60_000);
});
