// M1.5 spike runner (gate side). Throwaway; findings go in PHASE0_STATUS.md.
//
//   node spikes/m1.5/run.ts pixels          palette-exact readPixels, devtools capture, counters
//   node spikes/m1.5/run.ts perf <runs> <copies> <throttle>   A/A frame-time variance
//
// Expects the spike built into /tmp/spike-dist (vite build -c spikes/m1.5/vite.config.ts).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';

const DIST = '/tmp/spike-dist';
const palette = JSON.parse(readFileSync('guardrails/palette.json', 'utf8')) as { order: string[]; hex: Record<string, string> };
const allowed = new Map(palette.order.map((n) => [Number.parseInt((palette.hex[n] as string).slice(1), 16), n]));

const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const path = join(DIST, (req.url ?? '/').split('?')[0] === '/' ? 'index.html' : (req.url ?? '').split('?')[0] as string);
  try {
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((r) => server.listen(4173, '127.0.0.1', r));

// Gate-owned instrumentation, injected before any page script runs.
const INSTRUMENT = () => {
  const g = {
    scenes: [] as unknown[],
    renderers: [] as unknown[],
    gl: null as WebGL2RenderingContext | null,
    contextAttrs: null as unknown,
    drawCalls: 0,
    triangles: 0,
    texUploads: 0,
    shaders: [] as string[],
  };
  (window as unknown as { __gate: typeof g }).__gate = g;
  const hook = new EventTarget();
  hook.addEventListener('observe', (e) => {
    const d = (e as CustomEvent).detail as { isScene?: boolean; isWebGLRenderer?: boolean };
    if (d.isScene) g.scenes.push(d);
    if (d.isWebGLRenderer) g.renderers.push(d);
  });
  (window as unknown as { __THREE_DEVTOOLS__: EventTarget }).__THREE_DEVTOOLS__ = hook;

  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: Record<string, unknown>) {
    if (type === 'webgl2' || type === 'webgl') {
      attrs = { ...(attrs ?? {}), antialias: false, preserveDrawingBuffer: true };
    }
    const ctx = (origGetContext as (t: string, a?: unknown) => RenderingContext | null).call(this, type, attrs);
    if (ctx && type === 'webgl2') {
      g.gl = ctx as WebGL2RenderingContext;
      g.contextAttrs = (ctx as WebGL2RenderingContext).getContextAttributes();
    }
    return ctx;
  } as typeof HTMLCanvasElement.prototype.getContext;

  const P = WebGL2RenderingContext.prototype;
  const TRI = 4; // gl.TRIANGLES
  const de = P.drawElements;
  P.drawElements = function (mode, count, type, offset) {
    g.drawCalls++;
    if (mode === TRI) g.triangles += count / 3;
    return de.call(this, mode, count, type, offset);
  };
  const da = P.drawArrays;
  P.drawArrays = function (mode, first, count) {
    g.drawCalls++;
    if (mode === TRI) g.triangles += count / 3;
    return da.call(this, mode, first, count);
  };
  // three.js uploads nine 1x1 zero-filled placeholder textures at renderer init (WebGLState
  // createTexture). Anything else (an image/canvas/video source, or any size above 1x1) is a texture.
  for (const name of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'texStorage2D', 'texStorage3D', 'compressedTexImage2D', 'compressedTexImage3D', 'copyTexImage2D'] as const) {
    const orig = P[name] as (...a: unknown[]) => unknown;
    (P as unknown as Record<string, unknown>)[name] = function (this: WebGL2RenderingContext, ...a: unknown[]) {
      const placeholder =
        (name === 'texImage2D' && a.length === 9 && a[3] === 1 && a[4] === 1 && ArrayBuffer.isView(a[8])) ||
        (name === 'texImage3D' && a.length === 10 && a[3] === 1 && a[4] === 1 && a[5] === 1 && ArrayBuffer.isView(a[9]));
      if (!placeholder) g.texUploads++;
      return orig.apply(this, a);
    };
  }
  const ss = P.shaderSource;
  P.shaderSource = function (shader, src) {
    g.shaders.push(src);
    return ss.call(this, shader, src);
  };
};

const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'];

async function open(browser: Browser, w: number, h: number, query = ''): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.addInitScript(INSTRUMENT);
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://127.0.0.1:4173/${query}`);
  await page.waitForFunction(() => (window as unknown as { __spike?: { ready: boolean } }).__spike?.ready === true);
  return page;
}

async function pixels(): Promise<void> {
  const browser = await chromium.launch({ args: ARGS });
  let ok = true;
  for (const [w, h] of [[844, 390], [1440, 900]] as const) {
    const page = await open(browser, w, h);
    const r = await page.evaluate(() => {
      type G = { gl: WebGL2RenderingContext; scenes: { traverse: (f: (o: Record<string, unknown>) => void) => void }[]; renderers: unknown[]; contextAttrs: unknown; drawCalls: number; triangles: number; texUploads: number; shaders: string[] };
      const g = (window as unknown as { __gate: G }).__gate;
      const gl = g.gl;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererString = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const hist: Record<string, number> = {};
      for (let i = 0; i < buf.length; i += 4) {
        const k = ((buf[i] as number) << 16) | ((buf[i + 1] as number) << 8) | (buf[i + 2] as number);
        hist[k] = (hist[k] ?? 0) + 1;
      }
      // Scene walk via the devtools hook (gate side, no help from game code).
      let meshes = 0;
      let badIndex = 0;
      const materials = new Set<string>();
      for (const s of g.scenes) {
        s.traverse((o) => {
          if (!o.isMesh) return;
          meshes++;
          materials.add(String((o.material as { type: string }).type));
          const attr = (o.geometry as { attributes: Record<string, { array: ArrayLike<number> }> }).attributes.paletteIndex;
          if (!attr) badIndex++;
          else for (let i = 0; i < attr.array.length; i++) if ((attr.array[i] as number) > 9) badIndex++;
        });
      }
      return { rendererString, w, h, hist, scenes: g.scenes.length, renderers: g.renderers.length, contextAttrs: g.contextAttrs, meshes, badIndex, materials: [...materials], drawCalls: g.drawCalls, triangles: g.triangles, texUploads: g.texUploads, shaderCount: g.shaders.length };
    });
    const off = Object.entries(r.hist).filter(([k]) => !allowed.has(Number(k)));
    const named = Object.fromEntries(Object.entries(r.hist).map(([k, v]) => [allowed.get(Number(k)) ?? `#${Number(k).toString(16).padStart(6, '0')}`, v]));
    const swiftshader = /swiftshader/i.test(r.rendererString);
    ok &&= off.length === 0 && swiftshader && r.scenes === 1 && r.renderers === 1 && r.badIndex === 0 && r.texUploads === 0;
    console.log(JSON.stringify({ viewport: `${w}x${h}`, drawingBuffer: `${r.w}x${r.h}`, renderer: r.rendererString, swiftshader, contextAttrs: r.contextAttrs, offPalettePixelValues: off.length, offPalettePixels: off.reduce((a, [, v]) => a + v, 0), histogram: named, devtools: { scenes: r.scenes, renderers: r.renderers }, sceneWalk: { meshes: r.meshes, badPaletteIndex: r.badIndex, materials: r.materials }, counters: { drawCalls: r.drawCalls, triangles: r.triangles, texUploads: r.texUploads, shaders: r.shaderCount } }, null, 2));
    await page.screenshot({ path: `/tmp/spike-out/${w}x${h}.png` });
    await page.close();
  }
  await browser.close();
  console.log(ok ? 'PIXELS: PASS' : 'PIXELS: FAIL');
  if (!ok) process.exitCode = 1;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

async function perf(runs: number, copies: number, throttle: number): Promise<void> {
  // A and B are the same build; any difference between them is pure measurement noise.
  const medians: Record<'A' | 'B', number[]> = { A: [], B: [] };
  for (let i = 0; i < runs * 2; i++) {
    const side = i % 2 === 0 ? 'A' : 'B';
    const browser = await chromium.launch({ args: ARGS });
    const page = await open(browser, 844, 390, `?copies=${copies}`);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.evaluate(() => (window as unknown as { __spike: { renderFrames: (n: number) => number } }).__spike.renderFrames(30));
    medians[side].push(await page.evaluate(() => (window as unknown as { __spike: { renderFrames: (n: number) => number } }).__spike.renderFrames(300)));
    if (i === 0) console.log(JSON.stringify(await page.evaluate(() => { const g = (window as unknown as { __gate: { drawCalls: number; triangles: number } }).__gate; return { drawCallsTotal: g.drawCalls, trianglesTotal: g.triangles }; })));
    await browser.close();
  }
  console.log(JSON.stringify({ runsPerSide: runs, copies, throttle, meanMsPerFrame: medians }));
  // Noise model: draw k runs per side (k = 5, 7, 9) and see how far apart the two medians land.
  const all = [...medians.A, ...medians.B];
  const overall = median(all);
  let seed = 1;
  const rnd = (): number => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (const k of [5, 7, 9]) {
    const diffs: number[] = [];
    for (let t = 0; t < 5000; t++) {
      const pick = (xs: number[]): number[] => Array.from({ length: k }, () => xs[Math.floor(rnd() * xs.length)] as number);
      diffs.push(Math.abs(median(pick(medians.A)) - median(pick(medians.B))) / overall);
    }
    diffs.sort((a, b) => a - b);
    console.log(`k=${k}: |A-B|/median p50=${(100 * (diffs[2500] as number)).toFixed(1)}% p95=${(100 * (diffs[4750] as number)).toFixed(1)}% p99=${(100 * (diffs[4950] as number)).toFixed(1)}%`);
  }
  const sd = Math.sqrt(all.reduce((a, x) => a + (x - overall) ** 2, 0) / all.length);
  console.log(`overall median frame ${overall.toFixed(2)} ms, run-to-run CV ${((100 * sd) / overall).toFixed(1)}%, min ${Math.min(...all).toFixed(2)}, max ${Math.max(...all).toFixed(2)}`);
}

const mode = process.argv[2];
try {
  if (mode === 'pixels') await pixels();
  else if (mode === 'perf') await perf(Number(process.argv[3] ?? 20), Number(process.argv[4] ?? 12), Number(process.argv[5] ?? 4));
  else throw new Error('usage: run.ts pixels | perf <runs>');
} finally {
  server.close();
}
