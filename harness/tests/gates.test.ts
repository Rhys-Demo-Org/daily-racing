// Gate helpers and verdict logic (guardrails/gates/): flag parsing, measure loading with the nonce,
// report.ts failing closed, G2's per-car judging and G3's state diff.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cli, jsonFiles, loadMeasure, toolchainProblem, type Flags } from '../../guardrails/gates/lib.ts';
import { judgeCar } from '../../guardrails/gates/g2-verdict.ts';
import { diff } from '../../guardrails/gates/g3-verdict.ts';
import { COUNTDOWN_TICKS, createBot, createWorld, stepWorld, validateTrack, type CarView, type TrackData } from '../../src/sim/index.ts';
import { buildTrack } from '../../src/sim/track.ts';

const tmp = (): string => mkdtempSync(join(tmpdir(), 'gates-'));
const node = (args: string[]) => spawnSync(process.execPath, args, { encoding: 'utf8' });

describe('gate lib', () => {
  it('parses --flag value and bare flags, and rejects positionals', () => {
    expect(cli(['--out', 'r.json', '--maintenance', '--exit', '0']).flags).toEqual({ out: 'r.json', maintenance: true, exit: '0' });
    expect(() => cli(['stray'])).toThrow(/unexpected/);
  });

  it('loads the last stdout line only when the exit is 0 and it carries the nonce', () => {
    const dir = tmp();
    const f = (text: string, exit = '0', nonce = 'n1'): Flags => {
      writeFileSync(join(dir, 'out'), text);
      writeFileSync(join(dir, 'err'), 'boom');
      return { measure: join(dir, 'out'), exit, stderr: join(dir, 'err'), nonce };
    };
    expect(loadMeasure(f('noise {"x":0}\n{"nonce":"n1","x":1}\n'))).toEqual({ nonce: 'n1', x: 1 });
    expect(loadMeasure(f('{"nonce":"n1","x":1}\n', '137'))).toMatchObject({ pass: false, summary: 'measurement failed: measure exited 137', details: 'boom' });
    expect(loadMeasure(f('{"nonce":"n1","x":1}\n{"x":2}\n'))).toMatchObject({ pass: false, summary: /nonce/ }); // forged after the real line
    expect(loadMeasure(f('{"nonce":"n1"'))).toMatchObject({ pass: false });
    expect(loadMeasure(f('{"x":1}\n', '0', ''))).toMatchObject({ pass: false });
    expect(loadMeasure({ measure: join(dir, 'missing'), exit: '0', nonce: 'n1' })).toMatchObject({ pass: false });
  });

  it('lists json ids and reports toolchain mismatches', () => {
    const dir = tmp();
    for (const f of ['b.json', 'a.json', 'c.txt']) writeFileSync(join(dir, f), '{}');
    expect(jsonFiles(dir)).toEqual(['a', 'b']);
    expect(jsonFiles(join(dir, 'none'))).toEqual([]);
    expect(toolchainProblem({ node: process.version, image: 'i' }, 'i')).toEqual([]);
    expect(toolchainProblem({ node: process.version, image: 'i' }, 'i', ' / seeds 1', ' / seeds 2')[0]).toMatch(/toolchain mismatch.*seeds 1, now.*seeds 2/);
  });
});

describe('report.ts', () => {
  const run = (files: Record<string, string>) => {
    const r = tmp();
    const o = tmp();
    for (const [name, text] of Object.entries(files)) writeFileSync(join(r, name), text);
    const p = node(['guardrails/gates/report.ts', '--results', r, '--out', o, '--branch-sha', 'b'.repeat(40), '--main-sha', 'm'.repeat(40), '--started', 'now', '--duration-ms', '5']);
    return { code: p.status, gates: (JSON.parse(readFileSync(join(o, 'gates.json'), 'utf8')) as { gates: { id: string; pass: boolean; summary: string }[] }).gates };
  };
  const ok = JSON.stringify({ pass: true, summary: 'ok', details: '' });

  it('passes only when every gate has a passing result', () => {
    expect(run({ 'G1.json': ok, 'G2.json': ok, 'G3.json': ok, 'G8.json': ok }).code).toBe(0);
  });

  it('fails closed: a missing or malformed result fails, and a harness note overrides a pass', () => {
    const r = run({ 'G1.json': ok, 'G2.json': ok, 'G2.note': 'timed out at the 20-minute gate cap (g2)\n', 'G8.json': '{"pass":true' });
    expect(r.code).toBe(1);
    expect(r.gates.map((g) => [g.id, g.pass])).toEqual([['G1', true], ['G2', false], ['G3', false], ['G8', false]]);
    expect(r.gates[1]!.summary).toMatch(/timed out/);
    expect(r.gates[2]!.summary).toMatch(/no result/);
  });
});

describe('G2 judgeCar', () => {
  const data = JSON.parse(readFileSync('src/content/tracks/dust-bowl.json', 'utf8')) as TrackData;
  const track = buildTrack(validateTrack(data));
  const world = createWorld(data, { seed: 1, carCount: 1 });
  const bot = createBot(world, 0);
  const car = { x: [world.cars[0]!.x], z: [world.cars[0]!.z] };
  for (let t = 0; t < 60 * 300 && world.racers[0]!.finishTick === null; t++) {
    stepWorld(world, [bot.input(world)]);
    car.x.push(world.cars[0]!.x);
    car.z.push(world.cars[0]!.z);
  }
  const judge = (c: typeof car) => judgeCar(data, track, c, 'car').problems.join('\n');
  const mid = COUNTDOWN_TICKS + 600;

  it('accepts a real bot race with every lap', () => {
    expect(judgeCar(data, track, car, 'car')).toMatchObject({ problems: [], laps: { length: data.laps } });
  });

  it('flags a teleport, a stuck car and a car that does not finish', () => {
    expect(judge({ x: car.x.map((x, t) => (t === mid ? x + 5 : x)), z: car.z })).toMatch(/teleport at tick/);
    const parked = (xs: number[]) => xs.map((v, t) => (t > mid ? xs[mid]! : v));
    expect(judge({ x: parked(car.x), z: parked(car.z) })).toMatch(/stuck[\s\S]*did not finish/);
    expect(judge({ x: car.x.slice(0, mid), z: car.z.slice(0, mid) })).toMatch(/did not finish/);
  });
});

describe('G3 diff', () => {
  const view = { x: 1, z: 2, heading: 0.5, airborne: false } as unknown as CarView;
  it('allows the tolerance, flags anything beyond it, a changed flag or a car count', () => {
    expect(diff([view], [{ ...view, x: 1 + 5e-7 }], 1e-6)).toEqual([]);
    expect(diff([view], [{ ...view, x: 1 + 5e-7 }], 0)).toEqual(['car 0 x: 1.0000005, expected 1']);
    expect(diff([view], [{ ...view, airborne: true } as CarView], 1e-6)).toEqual(['car 0 airborne: true, expected false']);
    expect(diff([view], [view, view], 1e-6)).toEqual(['2 cars, expected 1']);
  });
});
