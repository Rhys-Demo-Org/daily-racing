// src/sim must stay a pure, deterministic, Node-runnable module: no outside imports, no clocks,
// globals or Math.random, and only erasable TypeScript so plain `node` can run it.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SIM_DIR = join(import.meta.dirname, '../../src/sim');
const files = readdirSync(SIM_DIR).filter((f) => f.endsWith('.ts'));

/** Source with comments and string contents removed, so prose can't trigger the checks. */
function code(file: string): string {
  return readFileSync(join(SIM_DIR, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
}

describe('src/sim purity', () => {
  it('has the expected modules', () => {
    for (const f of ['rng.ts', 'vec.ts', 'track.ts', 'car.ts', 'race.ts', 'world.ts', 'replay.ts', 'index.ts', 'types.ts']) {
      expect(files).toContain(f);
    }
  });

  for (const file of files) {
    it(`${file} uses no globals, clocks or randomness`, () => {
      const src = code(file);
      expect(src).not.toMatch(/\b(process|globalThis|window|navigator|document|Date|performance|Buffer|require)\b/);
      expect(src).not.toMatch(/Math\s*\.\s*random/);
      expect(src).not.toMatch(/\b(enum|namespace)\s+\w+/);
    });

    it(`${file} only imports sibling sim modules`, () => {
      const raw = readFileSync(join(SIM_DIR, file), 'utf8');
      const specifiers = [...raw.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+'([^']+)'/gm)].map((m) => m[1]);
      for (const s of specifiers) expect(s).toMatch(/^\.\/[a-z-]+\.ts$/);
      expect(raw).not.toMatch(/import\s*\(/);
    });
  }

  it('runs a race under plain node with native type stripping', () => {
    const script = `
      import { readFileSync } from 'node:fs';
      const sim = await import(${JSON.stringify(join(SIM_DIR, 'index.ts'))});
      const track = JSON.parse(readFileSync(${JSON.stringify(join(SIM_DIR, '../content/tracks/dust-bowl.json'))}, 'utf8'));
      const world = sim.createWorld(track, { seed: 1, carCount: 2 });
      for (let i = 0; i < 400; i++) sim.stepWorld(world, [{ steer: 0, throttle: true, brake: false }]);
      const layout = sim.trackLayout(track);
      console.log(JSON.stringify({ phase: sim.raceView(world).phase, x: sim.carViews(world)[0].x, n: layout.centre.length }));
    `;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    const result = JSON.parse(out.trim().split('\n').pop() ?? '{}');
    expect(result.phase).toBe('racing');
    expect(result.n).toBeGreaterThan(900);
    expect(typeof result.x).toBe('number');
  });
});
