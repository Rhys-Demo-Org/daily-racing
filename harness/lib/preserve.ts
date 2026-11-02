// Behaviour-preservation checks for maintenance nights (plans/full-pipeline.md "The 7th day"): the
// branch's measurement must equal main's, measured fresh from main on every run (no stored
// baseline, so nothing to rebaseline). Pure comparisons; the measurements come from
// harness/screens/probe.ts (P1: DOM + computed styles of every screen stage) and
// harness/screens/scene.ts (P2: geometry hashes of every track's scene and the cars).

import type { SceneEntry, SceneMeasure } from '../screens/scene.ts';

export type DomMeasure = { stages: Record<string, string[]> };

const clip = (s: string, n = 240): string => (s.length > n ? `${s.slice(0, n)}…` : s);

/** `prop:value` pairs of a snapshot line's `{…}` part. */
function props(line: string): Map<string, string> {
  const body = /\{(.*)\}$/.exec(line)?.[1] ?? '';
  return new Map(body.split(';').filter(Boolean).map((p) => [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1)]));
}

/** What differs between two snapshot lines, as briefly as possible. */
export function lineDiff(was: string, now: string): string {
  const head = (l: string): string => l.replace(/ \{.*\}$/, '').trim();
  const a = props(was);
  const b = props(now);
  const keys = [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
  const styles = keys.slice(0, 8).map((k) => `${k} ${a.get(k) ?? '(inherited)'} → ${b.get(k) ?? '(inherited)'}`).join('; ') + (keys.length > 8 ? '; …' : '');
  if (head(was) === head(now)) return `\`${clip(head(was), 120)}\`: ${styles}`;
  return `\`${clip(head(was))}\` became \`${clip(head(now))}\`${keys.length ? `; ${styles}` : ''}`;
}

/**
 * Differences between main's and the branch's stage snapshots: stages missing or new, then per
 * stage the first `perStage` differing lines (aligned by position) and how many differ in all.
 */
export function diffDom(main: DomMeasure, branch: DomMeasure, perStage = 3): string[] {
  const out: string[] = [];
  const was = main.stages ?? {};
  const now = branch.stages ?? {};
  const names = [...new Set([...Object.keys(was), ...Object.keys(now)])].sort();
  for (const name of names) {
    const a = was[name];
    const b = now[name];
    if (!a) { out.push(`${name}: new on the branch (a maintenance night adds no screen stage)`); continue; }
    if (!b) { out.push(`${name}: missing on the branch`); continue; }
    const n = Math.max(a.length, b.length);
    const diffs: string[] = [];
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (a[i] === b[i]) continue;
      count++;
      if (diffs.length < perStage) {
        diffs.push(a[i] === undefined ? `line ${i + 1} added: \`${clip(b[i]!.trim())}\`` : b[i] === undefined ? `line ${i + 1} removed: \`${clip(a[i]!.trim())}\`` : `line ${i + 1}: ${lineDiff(a[i]!, b[i]!)}`);
      }
    }
    if (count) out.push(`${name}: ${count} of ${n} line(s) differ${a.length !== b.length ? ` (${a.length} → ${b.length} lines)` : ''}\n  ${diffs.join('\n  ')}`);
  }
  return out;
}

const brief = (e: SceneEntry): string => `${e.type}, ${e.triangles} triangles, ${e.vertices} vertices`;

function diffEntries(what: string, a: readonly SceneEntry[], b: readonly SceneEntry[], max: number): string[] {
  const was = new Map(a.map((e) => [e.path, e]));
  const now = new Map(b.map((e) => [e.path, e]));
  const out: string[] = [];
  for (const [path, e] of was) {
    const f = now.get(path);
    if (!f) out.push(`${what} ${path}: missing on the branch (${brief(e)})`);
    else if (f.hash !== e.hash || f.type !== e.type) out.push(`${what} ${path}: changed (${brief(e)} → ${brief(f)})`);
  }
  for (const [path, f] of now) if (!was.has(path)) out.push(`${what} ${path}: new on the branch (${brief(f)})`);
  return out.length > max ? [...out.slice(0, max), `${what}: … ${out.length - max} more object(s) differ`] : out;
}

/** Differences between main's and the branch's scene measurements, per track and car livery. */
export function diffScenes(main: SceneMeasure, branch: SceneMeasure, perScene = 6): string[] {
  const out: string[] = [];
  const pairs = <T extends { error?: string }>(kind: string, a: readonly T[], b: readonly T[], key: (x: T) => string, each: (name: string, x: T, y: T) => void): void => {
    const was = new Map(a.map((x) => [key(x), x]));
    const now = new Map(b.map((x) => [key(x), x]));
    for (const [k, x] of was) {
      const y = now.get(k);
      if (!y) out.push(`${kind} ${k}: missing on the branch`);
      else if (y.error && !x.error) out.push(`${kind} ${k}: the branch could not build it: ${clip(y.error, 400)}`);
      else each(k, x, y);
    }
    for (const k of now.keys()) if (!was.has(k)) out.push(`${kind} ${k}: new on the branch`);
  };
  pairs('track', main.tracks ?? [], branch.tracks ?? [], (t) => t.id, (k, x, y) => {
    out.push(...diffEntries(`track ${k}`, x.entries, y.entries, perScene));
    if (x.camera !== y.camera) out.push(`track ${k}: the camera differs after the same frames`);
  });
  pairs('car', main.cars ?? [], branch.cars ?? [], (c) => c.livery, (k, x, y) => out.push(...diffEntries(`car ${k}`, x.entries, y.entries, perScene)));
  return out;
}

/** Totals of a scene measurement, for the gate summary. */
export function sceneCount(m: SceneMeasure): string {
  const objects = m.tracks.reduce((n, t) => n + t.entries.length, 0) + m.cars.reduce((n, c) => n + c.entries.length, 0);
  return `${m.tracks.length} track scene(s) and ${m.cars.length} car(s), ${objects} objects`;
}
