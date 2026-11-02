// Behaviour-preservation verdicts for maintenance nights (plans/full-pipeline.md "The 7th day"):
//   P1 (--kind dom)    every screen stage's DOM and computed styles, branch vs main
//   P2 (--kind scene)  every track's scene and every car's geometry hashes, branch vs main
// Both measurements are taken fresh in this gate run (main's once per main SHA and image), so there
// is no stored baseline. Any difference fails the gate.
//
//   node p-verdict.ts --kind dom|scene --measure <f> --exit <n> --stderr <f> --nonce <s>
//                     --main-measure <f> --out <result.json>
import { diffDom, diffScenes, sceneCount, type DomMeasure } from '../../harness/lib/preserve.ts';
import type { SceneMeasure } from '../../harness/screens/scene.ts';
import { finish, flag, readText, verdict, verdictArgs } from './lib.ts';

const { flags, m, out } = verdictArgs<DomMeasure & SceneMeasure>();
const kind = flag(flags, 'kind');
let main: (DomMeasure & SceneMeasure) | null = null;
try {
  const text = readText(flag(flags, 'main-measure')) ?? '';
  main = JSON.parse(text.slice(text.lastIndexOf('\n', text.length - 2) + 1)) as DomMeasure & SceneMeasure;
} catch {
  main = null;
}
if (!main) finish(out, { pass: false, summary: "main's measurement failed (no comparison possible)", details: '' });
let problems: string[];
try {
  if (kind === 'dom' && !Object.keys(main.stages ?? {}).length) problems = ['main has no screen stages to compare'];
  else problems = kind === 'dom' ? diffDom(main, m) : diffScenes(main, m);
} catch (e) {
  problems = [`the measurements could not be compared: ${(e as Error).message}`];
}
finish(out, kind === 'dom'
  ? verdict(problems, `${Object.keys(main.stages).length} stage snapshot(s) (DOM + computed styles) identical to main`, (k) => `${k} stage snapshot(s) differ from main`)
  : verdict(problems, `geometry identical to main: ${sceneCount(main)}`, (k) => `${k} scene difference(s) from main`));
