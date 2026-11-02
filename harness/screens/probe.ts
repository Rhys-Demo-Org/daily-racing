// Page measurements of a harness build (harness/screens/vite.config.ts), in the toolchain container,
// offline. Prints one JSON line, stamped with GATE_NONCE when set (a gate measure step's only way out).
//
//   node harness/screens/probe.ts dom <dist-dir>    gate P1: a DOM + computed-style snapshot
//                                                   (dom.ts) of every screen stage at every viewport
//   node harness/screens/probe.ts perf <dist-dir>   the Sunday performance survey's numbers: per track,
//                                                   draw calls and triangles per rendered frame, DOM
//                                                   mutations per tick, sampled JS allocations per
//                                                   frame (by function); DOM size per stage
//
// Counts only, no timings: the fake clock stops performance.now, and software WebGL (SwiftShader)
// says nothing about a phone's frame time. Allocations are V8's sampling heap profile (every ~256
// bytes), so they are estimates. Build with `--minify false` so allocation sites keep their names.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { assertNoErrors, context, GAME_READY, launch, open, renderStage, serve, stageNames } from './browser.ts';
import { snapshotDom, STYLE_PROPS } from './dom.ts';
import { RACE_SEED, VIEWPORTS, viewportName } from './shots.ts';

/** Ticks stepped (one rendered frame each) before and while measuring a race. */
export const WARMUP_TICKS = 300;
export const MEASURE_TICKS = 240;

/** Installed before any page script: counts WebGL draw calls and triangles into window.__draws. */
function countDraws(): void {
  const c = { calls: 0, triangles: 0, lines: 0 };
  (window as unknown as { __draws: typeof c }).__draws = c;
  // Named __probe* so the allocation report can leave the probe's own allocations out.
  const __probeCount = (name: string, a: number[]): { n: number; inst: number } => {
    switch (name) {
      case 'drawArrays': return { n: a[2] ?? 0, inst: 1 };
      case 'drawElements': return { n: a[1] ?? 0, inst: 1 };
      case 'drawArraysInstanced': return { n: a[2] ?? 0, inst: a[3] ?? 1 };
      case 'drawElementsInstanced': return { n: a[1] ?? 0, inst: a[4] ?? 1 };
      default: return { n: a[3] ?? 0, inst: 1 }; // drawRangeElements(mode, start, end, count, ...)
    }
  };
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype] as unknown as Record<string, (...a: number[]) => unknown>[]) {
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) {
      const f = proto[name];
      if (typeof f !== 'function') continue;
      proto[name] = function __probeDraw(this: unknown, ...a: number[]) {
        const { n, inst } = __probeCount(name, a);
        c.calls++;
        if (a[0] === 4) c.triangles += Math.floor(n / 3) * inst;
        else if (a[0] === 1) c.lines += Math.floor(n / 2) * inst;
        return f.apply(this, a);
      };
    }
  }
}

type HeapNode = { callFrame: { functionName: string; url: string; lineNumber: number }; selfSize: number; children: HeapNode[] };

/** Sampled allocation bytes by function (`name (file:line)`), largest first. */
function allocations(head: HeapNode): { total: number; top: { site: string; bytes: number }[] } {
  const by = new Map<string, number>();
  let total = 0;
  const walk = (n: HeapNode): void => {
    if (n.selfSize > 0 && !n.callFrame.functionName.startsWith('__probe')) {
      const file = n.callFrame.url.split('/').pop() || '(native)';
      const site = `${n.callFrame.functionName || '(anonymous)'} (${file}:${n.callFrame.lineNumber + 1})`;
      by.set(site, (by.get(site) ?? 0) + n.selfSize);
      total += n.selfSize;
    }
    n.children.forEach(walk);
  };
  walk(head);
  return { total, top: [...by].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([site, bytes]) => ({ site, bytes })) };
}

const THROTTLE = { steer: 0, throttle: true, brake: false };

/** One race: warm up, then measure MEASURE_TICKS single-tick steps (each renders a frame). */
async function raceProbe(ctx: BrowserContext, origin: string, track: string): Promise<Record<string, unknown>> {
  const page: Page = await open(ctx, origin, '/', GAME_READY);
  await page.evaluate(({ track, seed }) => {
    const r = (window as unknown as { __racer: { startRace(o: object): unknown; freeze(): void } }).__racer;
    r.startRace({ track, seed });
    r.freeze();
  }, { track, seed: RACE_SEED });
  type W = { __racer: { step(n: number, i: object): unknown }; __draws: { calls: number; triangles: number; lines: number }; __mut: { observer: MutationObserver; counts: Record<string, number>; targets: Record<string, number> } };
  await page.evaluate(({ n, input }) => { for (let i = 0; i < n; i++) (window as unknown as W).__racer.step(1, input); }, { n: WARMUP_TICKS, input: THROTTLE });
  await page.evaluate(() => {
    const w = window as unknown as W;
    const counts: Record<string, number> = {};
    const targets: Record<string, number> = {};
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        counts[r.type] = (counts[r.type] ?? 0) + 1;
        const t = r.target instanceof Element ? r.target : r.target.parentElement;
        const key = t ? `${t.tagName.toLowerCase()}${t.className && typeof t.className === 'string' ? `.${t.className.trim().split(/\s+/).join('.')}` : ''}` : '?';
        targets[key] = (targets[key] ?? 0) + 1;
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    w.__mut = { observer, counts, targets };
    w.__draws.calls = 0;
    w.__draws.triangles = 0;
    w.__draws.lines = 0;
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 256, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await page.evaluate(({ n, input }) => { for (let i = 0; i < n; i++) (window as unknown as W).__racer.step(1, input); }, { n: MEASURE_TICKS, input: THROTTLE });
  const { profile } = (await cdp.send('HeapProfiler.stopSampling')) as unknown as { profile: { head: HeapNode } };
  const dom = await page.evaluate(() => {
    const w = window as unknown as W;
    const pending = w.__mut.observer.takeRecords();
    for (const r of pending) w.__mut.counts[r.type] = (w.__mut.counts[r.type] ?? 0) + 1;
    w.__mut.observer.disconnect();
    return { counts: w.__mut.counts, targets: w.__mut.targets, draws: w.__draws, elements: document.getElementsByTagName('*').length };
  });
  assertNoErrors(page, `perf ${track}`);
  await page.close();
  const alloc = allocations(profile.head);
  const per = (n: number): number => Math.round((n / MEASURE_TICKS) * 100) / 100;
  const mutations = Object.values(dom.counts).reduce((a, b) => a + b, 0);
  return {
    track,
    frames: MEASURE_TICKS,
    drawCallsPerFrame: per(dom.draws.calls),
    trianglesPerFrame: per(dom.draws.triangles),
    lineSegmentsPerFrame: per(dom.draws.lines),
    domMutationsPerTick: per(mutations),
    domMutationsByType: dom.counts,
    domMutationTargets: Object.entries(dom.targets).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([target, n]) => ({ target, perTick: per(n) })),
    domElements: dom.elements,
    sampledAllocBytesPerFrame: Math.round(alloc.total / MEASURE_TICKS),
    topAllocationSites: alloc.top.map((a) => ({ site: a.site, bytesPerFrame: Math.round(a.bytes / MEASURE_TICKS) })),
  };
}

async function main(): Promise<void> {
  const [mode, distArg] = process.argv.slice(2);
  if ((mode !== 'dom' && mode !== 'perf') || !distArg) throw new Error('usage: node harness/screens/probe.ts dom|perf <dist-dir>');
  const { origin, server } = await serve(resolve(distArg));
  const browser = await launch(mode === 'perf' ? ['--enable-precise-memory-info'] : []);
  const value: Record<string, unknown> = {};
  try {
    if (mode === 'dom') {
      const stages: Record<string, string[]> = {};
      for (const v of VIEWPORTS) {
        const ctx = await context(browser, v);
        for (const name of await stageNames(ctx, origin)) {
          const page = await renderStage(ctx, origin, name);
          assertNoErrors(page, `${viewportName(v)} stage ${name}`);
          stages[`${viewportName(v)}/${name}`] = await page.evaluate(snapshotDom, STYLE_PROPS);
          await page.close();
        }
        await ctx.close();
      }
      value.stages = stages;
    } else {
      const v = VIEWPORTS[0]!;
      const ctx = await context(browser, v);
      await ctx.addInitScript(`(${countDraws.toString()})();`);
      const stageSizes: Record<string, number> = {};
      for (const name of await stageNames(ctx, origin)) {
        const page = await renderStage(ctx, origin, name);
        stageSizes[name] = await page.evaluate(() => document.getElementsByTagName('*').length);
        await page.close();
      }
      const tracksDir = new URL('../../src/content/tracks/', import.meta.url).pathname;
      const tracks = readdirSync(tracksDir).filter((f) => f.endsWith('.json')).sort().map((f) => f.slice(0, -5));
      const races = [];
      for (const t of tracks) races.push(await raceProbe(ctx, origin, t));
      await ctx.close();
      Object.assign(value, { viewport: viewportName(v), races, stageElements: stageSizes });
    }
  } finally {
    await browser.close();
    server.close();
  }
  process.stdout.write(`\n${JSON.stringify({ nonce: process.env['GATE_NONCE'], ...value })}\n`);
}

if (import.meta.main) await main();
