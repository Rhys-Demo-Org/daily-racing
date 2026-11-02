// Behaviour-preservation gates P1 and P2 (plans/full-pipeline.md "The 7th day"): the scene hash
// (harness/screens/scene.ts) and the comparisons the gate verdict makes (harness/lib/preserve.ts).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BufferAttribute, Mesh } from 'three';
import { createRaceScene, playerLivery, type CarLivery } from '../../src/render/index.ts';
import { trackLayout } from '../../src/sim/index.ts';
import { getTrack } from '../../src/content/tracks.ts';
import { diffDom, diffScenes, lineDiff } from '../lib/preserve.ts';
import { sceneEntries, sceneTotals, type SceneEntry, type SceneMeasure } from '../screens/scene.ts';

const liveries: CarLivery[] = [playerLivery(1), { body: 'mustard', stripe: 'navy', number: 7, player: false }];
const layout = trackLayout(getTrack('dust-bowl'));
const build = () => {
  const race = createRaceScene(layout, liveries);
  race.scene.updateMatrixWorld(true);
  return race;
};
type Walkable = Parameters<typeof sceneEntries>[0];
const entries = (race: ReturnType<typeof build>): SceneEntry[] => sceneEntries(race.scene as unknown as Walkable);
const changed = (a: SceneEntry[], b: SceneEntry[]): string[] => a.filter((e, i) => e.hash !== b[i]?.hash).map((e) => e.path);
const firstMesh = (race: ReturnType<typeof build>, group: string): Mesh => race.scene.getObjectByName(group)!.children[0] as Mesh;

// Each build of a full race scene takes a second or more, several per test: under load (P1/P2 measuring
// in parallel with G1) they ran past vitest's 5 s default, so they get room.
describe('scene hash (P2)', { timeout: 60_000 }, () => {
  it('is the same for two builds of the same scene, with stable paths', () => {
    const a = entries(build());
    const b = entries(build());
    expect(b).toEqual(a);
    expect(a[0]?.path).toBe('race');
    expect(a.some((e) => e.path === 'race/props[0]/prop-cell[0]' && e.hash.length === 16)).toBe(true);
    expect(sceneTotals(a).draws).toBeGreaterThan(50);
  });

  it('changes for exactly the object whose vertices, palette indices, material or transform changed', () => {
    const base = entries(build());

    const moved = build();
    const pos = firstMesh(moved, 'props').geometry.getAttribute('position') as BufferAttribute;
    pos.setX(0, pos.getX(0) + 0.01);
    expect(changed(base, entries(moved))).toEqual(['race/props[0]/prop-cell[0]', 'race/props[0]/prop-cell[0]/hull[0]']); // the hull shares its geometry

    const recoloured = build();
    const pal = firstMesh(recoloured, 'track').geometry.getAttribute('paletteIndex') as BufferAttribute;
    pal.setX(0, (pal.getX(0) + 1) % 10);
    expect(changed(base, entries(recoloured))).toEqual(['race/track[0]/track-chunk[0]']);

    const placed = build();
    const car = placed.cars[1]!.root;
    car.position.x += 1;
    placed.scene.updateMatrixWorld(true);
    const diff = changed(base, entries(placed));
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every((p) => p.startsWith('race/cars[0]/'))).toBe(true);

    const restyled = build();
    const m = firstMesh(restyled, 'props').material as { side: number };
    m.side = m.side === 0 ? 1 : 0; // the toon material is shared: every object using it changes
    expect(changed(base, entries(restyled)).length).toBeGreaterThan(1);
  });

  it('ignores float noise below 1e-6 (reordered arithmetic) but not real moves', () => {
    const base = entries(build());
    const noisy = build();
    const pos = firstMesh(noisy, 'props').geometry.getAttribute('position') as BufferAttribute;
    pos.setX(0, pos.getX(0) + 1e-9);
    expect(changed(base, entries(noisy))).toEqual([]);
  });

  it('runs headless under plain node against a tree (the gate measure step)', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const r = spawnSync(process.execPath, ['harness/screens/scene.ts', root, 'stats'], { cwd: root, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout.trim().split('\n').at(-1)!) as { tracks: { id: string; draws: number; triangles: number; error?: string }[]; cars: unknown[] };
    expect(out.tracks.map((t) => t.id)).toContain('dust-bowl');
    expect(out.tracks.every((t) => !t.error && t.draws > 0 && t.triangles > 0)).toBe(true);
    expect(out.cars.length).toBeGreaterThan(1);
  });
});

const entry = (path: string, hash: string): SceneEntry => ({ path, type: 'Mesh', hash, draws: 1, triangles: 12, vertices: 24 });
const scene = (over: Partial<SceneMeasure> = {}): SceneMeasure => ({
  tracks: [{ id: 'dust-bowl', entries: [entry('race', ''), entry('race/a[0]', 'aaaa'), entry('race/b[0]', 'bbbb')], camera: 'cam' }],
  cars: [{ livery: 'rally-red/cream#1 (player)', entries: [entry('car', 'cccc')] }],
  ...over,
});

describe('scene comparison (P2 verdict)', () => {
  it('passes identical measurements and names each changed, missing or new object', () => {
    expect(diffScenes(scene(), scene())).toEqual([]);
    const t = scene().tracks[0]!;
    const branch = scene({ tracks: [{ ...t, entries: [t.entries[0]!, entry('race/a[0]', 'zzzz'), entry('race/c[0]', 'cccc')], camera: 'moved' }] });
    expect(diffScenes(scene(), branch)).toEqual([
      'track dust-bowl race/a[0]: changed (Mesh, 12 triangles, 24 vertices → Mesh, 12 triangles, 24 vertices)',
      'track dust-bowl race/b[0]: missing on the branch (Mesh, 12 triangles, 24 vertices)',
      'track dust-bowl race/c[0]: new on the branch (Mesh, 12 triangles, 24 vertices)',
      'track dust-bowl: the camera differs after the same frames',
    ]);
  });

  it('fails a track or car the branch could not build, or dropped', () => {
    const broken = scene({ tracks: [{ id: 'dust-bowl', entries: [], camera: '', error: 'TypeError: createRaceScene is not a function' }], cars: [] });
    expect(diffScenes(scene(), broken)).toEqual(['track dust-bowl: the branch could not build it: TypeError: createRaceScene is not a function', 'car rally-red/cream#1 (player): missing on the branch']);
  });
});

describe('DOM + computed-style comparison (P1 verdict)', () => {
  const stage = ['<body> @0,0 844x390 {color:red;width:844px}', '  <div class="a"> @0,0 10x10 {width:10px}', '    "GO!"'];
  it('passes identical snapshots and names the stage, line and property that changed', () => {
    expect(diffDom({ stages: { s: stage } }, { stages: { s: [...stage] } })).toEqual([]);
    const now = [stage[0]!, '  <div class="a"> @0,0 12x10 {width:12px}', stage[2]!];
    expect(diffDom({ stages: { s: stage } }, { stages: { s: now } })).toEqual(['s: 1 of 3 line(s) differ\n  line 2: `<div class="a"> @0,0 10x10` became `<div class="a"> @0,0 12x10`; width 10px → 12px']);
    expect(lineDiff('<i> @0,0 1x1 {color:red;width:1px}', '<i> @0,0 1x1 {color:blue}')).toBe('`<i> @0,0 1x1`: color red → blue; width 1px → (inherited)');
  });

  it('a stage missing, new, or with lines added', () => {
    expect(diffDom({ stages: { a: stage, b: stage } }, { stages: { a: stage, c: stage } })).toEqual(['b: missing on the branch', 'c: new on the branch (a maintenance night adds no screen stage)']);
    expect(diffDom({ stages: { a: stage } }, { stages: { a: [...stage, '    "!"'] } })[0]).toMatch(/^a: 1 of 4 line\(s\) differ \(3 → 4 lines\)\n {2}line 4 added: `"!"`$/);
  });
});
