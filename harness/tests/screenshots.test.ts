// harness/screens: the shots the screenshot script takes and the index.json other harness steps
// read ([{ name, kind: "stage" | "race", viewport: "844x390", path }]).
import { accessSync, constants, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkIndex, planShots, raceMoments, VIEWPORTS, viewportName } from '../screens/shots.ts';
import { COUNTDOWN_TICKS } from '../../src/sim/index.ts';

describe('screenshot index', () => {
  const index = planShots(['pause--paused', 'results--podium'], ['dust-bowl-countdown', 'dust-bowl-finished']);

  it('covers every stage and race frame at 844x390 and 1440x900', () => {
    expect(VIEWPORTS.map(viewportName)).toEqual(['844x390', '1440x900']);
    expect(index).toHaveLength(8);
    expect(index[0]).toEqual({ name: 'pause--paused', kind: 'stage', viewport: '844x390', path: '844x390/stage/pause--paused.png' });
    expect(index[3]).toEqual({ name: 'dust-bowl-finished', kind: 'race', viewport: '844x390', path: '844x390/race/dust-bowl-finished.png' });
    for (const e of index) expect(Object.keys(e).sort()).toEqual(['kind', 'name', 'path', 'viewport']);
    expect(new Set(index.map((e) => e.path)).size).toBe(index.length);
    expect(checkIndex(JSON.parse(JSON.stringify(index)))).toEqual([]);
  });

  it('rejects a malformed index', () => {
    const one = index[0] as object;
    expect(checkIndex({})).toEqual(['index is not an array']);
    expect(checkIndex([])).toEqual(['index is empty']);
    expect(checkIndex([{ ...one, kind: 'menu' }])).toEqual(['entry 0 has a bad kind']);
    expect(checkIndex([{ ...one, viewport: '844' }])).toEqual(['entry 0 has a bad viewport']);
    expect(checkIndex([{ ...one, path: '/abs.png' }])).toEqual(['entry 0 has a bad path']);
    expect(checkIndex([{ ...one, path: '../up.png' }])).toEqual(['entry 0 has a bad path']);
    expect(checkIndex([{ ...one, extra: 1 }])).toEqual(['entry 0 has unknown keys extra']);
    expect(checkIndex([one, one])).toEqual(['entry 1 repeats path 844x390/stage/pause--paused.png', 'entry 1 repeats stage pause--paused 844x390']);
  });

  it('frames the race in order: countdown, just after GO, mid-race, finished', () => {
    const m = raceMoments(7500);
    expect(m.map((x) => x.name)).toEqual(['countdown', 'start', 'mid-race', 'finished']);
    expect(m[0]?.tick).toBeLessThan(COUNTDOWN_TICKS);
    expect(m[1]?.tick).toBeGreaterThan(COUNTDOWN_TICKS);
    expect(m.map((x) => x.tick)).toEqual([...m.map((x) => x.tick)].sort((a, b) => a - b));
    expect(m[3]?.tick).toBe(7500);
  });

  it('ships an executable script that runs capture.ts on the harness build', () => {
    accessSync('harness/scripts/screenshots.sh', constants.X_OK);
    const sh = readFileSync('harness/scripts/screenshots.sh', 'utf8');
    expect(sh).toContain('--config harness/screens/vite.config.ts');
    expect(sh).toContain('node harness/screens/capture.ts');
    expect(sh).toContain('--network none');
    // The production build has only the game's page; the stages page is the harness config's.
    expect(readFileSync('vite.config.ts', 'utf8')).not.toMatch(/stages/);
    expect(readFileSync('harness/screens/vite.config.ts', 'utf8')).toContain('stages.html');
  });

  it('gives the builder and fixer the in-sandbox command, never the Docker-only scripts', () => {
    const cmd = 'node_modules/.bin/vite build --config harness/screens/vite.config.ts --outDir /tmp/shots-dist --emptyOutDir && node harness/screens/capture.ts /tmp/shots-dist /tmp/shots';
    for (const f of ['harness/prompts/build.md', 'harness/prompts/fix.md']) {
      const p = readFileSync(f, 'utf8');
      expect(p, f).toContain(cmd);
      expect(p, f).toMatch(/already inside the toolchain container/);
      // Named only to forbid them.
      for (const line of p.split('\n').filter((l) => /screenshots\.sh|in-container\.sh/.test(l))) expect(line, f).toMatch(/Never|never/);
    }
    expect(readFileSync('harness/scripts/self-test-sandbox.sh', 'utf8')).toContain('node harness/screens/capture.ts /tmp/shots-dist /tmp/shots');
  });
});
