// 2026-11-03: the live night failed when ideate hit its 15-turn cap before writing a spec, and R2
// had already used 59 of 60 turns and 17.5 of 20 minutes. These floors keep about 2x headroom over
// the most each phase has used in any run so far; raise them, never lower them, as runs grow.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = Object.fromEntries(
  readFileSync(new URL('../config.env', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => /^([A-Z0-9_]+)=(\d+)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => [m[1], Number(m[2])]),
);

const FLOORS: Record<string, number> = {
  MAX_TURNS_IDEATE: 40,
  MAX_TURNS_AUDIT: 50,
  MAX_TURNS_BUILD: 60,
  MAX_TURNS_RETRY: 25,
  MAX_TURNS_REVIEW: 120,
  MAX_TURNS_VERIFY: 80,
  MAX_TURNS_FIX: 40,
  MAX_TURNS_JUDGE: 50,
  MAX_TURNS_SURVEY: 60,
  WALL_REVIEW_MIN: 40,
};

describe('phase limits keep headroom over observed use', () => {
  for (const [key, floor] of Object.entries(FLOORS)) {
    it(`${key} is at least ${floor}`, () => {
      expect(config[key]).toBeGreaterThanOrEqual(floor);
    });
  }
});
