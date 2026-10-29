// M2 render preview runner (gate-style, throwaway). Adapted from spikes/m1.5/run.ts.
//
//   pnpm exec vite build -c spikes/m2-render/vite.config.ts && node spikes/m2-render/run.ts [outDir] [at]
//
// Screenshots the preview at 844×390 and 1440×900 under SwiftShader with antialiasing forced off,
// and asserts: SwiftShader renderer, 0 off-palette pixels (outlines on), 0 non-placeholder texture
// uploads. Prints draw calls and triangles for one frame. Screenshots go to outDir (never commit them).
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from '@playwright/test';

const DIST = '/tmp/m2-render-dist';
const OUT = process.argv[2] ?? '/tmp/m2-render-out';
const AT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const palette = JSON.parse(readFileSync('guardrails/palette.json', 'utf8')) as { order: string[]; hex: Record<string, string> };
const allowed = new Map(palette.order.map((n) => [Number.parseInt((palette.hex[n] as string).slice(1), 16), n]));

const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0] as string;
  const path = join(DIST, url === '/' ? 'index.html' : url);
  try {
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((r) => server.listen(4174, '127.0.0.1', r));

// Gate-owned instrumentation, injected before any page script runs (same as the M1.5 spike).
const INSTRUMENT = () => {
  const g = { gl: null as WebGL2RenderingContext | null, drawCalls: 0, triangles: 0, texUploads: 0, scenes: 0 };
  (window as unknown as { __gate: typeof g }).__gate = g;
  const hook = new EventTarget();
  hook.addEventListener('observe', (e) => {
    if (((e as CustomEvent).detail as { isScene?: boolean }).isScene) g.scenes++;
  });
  (window as unknown as { __THREE_DEVTOOLS__: EventTarget }).__THREE_DEVTOOLS__ = hook;
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: Record<string, unknown>) {
    if (type === 'webgl2' || type === 'webgl') attrs = { ...(attrs ?? {}), antialias: false, preserveDrawingBuffer: true };
    const ctx = (origGetContext as (t: string, a?: unknown) => RenderingContext | null).call(this, type, attrs);
    if (ctx && type === 'webgl2') g.gl = ctx as WebGL2RenderingContext;
    return ctx;
  } as typeof HTMLCanvasElement.prototype.getContext;
  const P = WebGL2RenderingContext.prototype;
  const de = P.drawElements;
  P.drawElements = function (mode, count, type, offset) {
    g.drawCalls++;
    if (mode === 4) g.triangles += count / 3;
    return de.call(this, mode, count, type, offset);
  };
  const da = P.drawArrays;
  P.drawArrays = function (mode, first, count) {
    g.drawCalls++;
    if (mode === 4) g.triangles += count / 3;
    return da.call(this, mode, first, count);
  };
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
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let ok = true;
try {
  for (const [w, h] of [[844, 390], [1440, 900]] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.addInitScript(INSTRUMENT);
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
    await page.goto(`http://127.0.0.1:4174/${AT ? `?at=${AT}` : ''}`);
    await page.waitForFunction(() => (window as unknown as { __preview?: { ready: boolean } }).__preview?.ready === true, null, { timeout: 60000 });
    const r = await page.evaluate(() => {
      type G = { gl: WebGL2RenderingContext; drawCalls: number; triangles: number; texUploads: number; scenes: number };
      const g = (window as unknown as { __gate: G }).__gate;
      const preview = (window as unknown as { __preview: { render: () => void; triangles: number } }).__preview;
      g.drawCalls = 0;
      g.triangles = 0;
      preview.render(); // one counted frame
      const gl = g.gl;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererString = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      const bw = gl.drawingBufferWidth;
      const bh = gl.drawingBufferHeight;
      const buf = new Uint8Array(bw * bh * 4);
      gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const hist: Record<string, number> = {};
      for (let i = 0; i < buf.length; i += 4) {
        const k = ((buf[i] as number) << 16) | ((buf[i + 1] as number) << 8) | (buf[i + 2] as number);
        hist[k] = (hist[k] ?? 0) + 1;
      }
      return { rendererString, bw, bh, hist, drawCalls: g.drawCalls, triangles: g.triangles, texUploads: g.texUploads, scenes: g.scenes, sceneTriangles: preview.triangles, aa: gl.getContextAttributes()?.antialias };
    });
    const off = Object.entries(r.hist).filter(([k]) => !allowed.has(Number(k)));
    const named = Object.fromEntries(Object.entries(r.hist).map(([k, v]) => [allowed.get(Number(k)) ?? `#${Number(k).toString(16).padStart(6, '0')}`, v]));
    const swiftshader = /swiftshader/i.test(r.rendererString);
    const pass = off.length === 0 && swiftshader && r.texUploads === 0 && r.aa === false;
    ok &&= pass;
    console.log(JSON.stringify({ viewport: `${w}x${h}`, buffer: `${r.bw}x${r.bh}`, swiftshader, antialias: r.aa, offPalettePixels: off.reduce((a, [, v]) => a + v, 0), texUploads: r.texUploads, frame: { drawCalls: r.drawCalls, triangles: r.triangles }, sceneTriangles: r.sceneTriangles, histogram: named, pass }));
    await page.screenshot({ path: join(OUT, `m2-render-${w}x${h}.png`) });
    // 3× nearest-neighbour crop around the player, for inspecting outlines and details.
    const zoom = await page.evaluate(() => {
      const p = (window as unknown as { __preview: { playerScreen: () => [number, number] } }).__preview.playerScreen();
      const src = document.querySelector('canvas') as HTMLCanvasElement;
      const cw = 200;
      const ch = 140;
      const out = document.createElement('canvas');
      out.width = cw * 3;
      out.height = ch * 3;
      const ctx = out.getContext('2d') as CanvasRenderingContext2D;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, p[0] - cw / 2, p[1] - ch / 2, cw, ch, 0, 0, cw * 3, ch * 3);
      return out.toDataURL('image/png').split(',')[1] as string;
    });
    writeFileSync(join(OUT, `m2-render-${w}x${h}-zoom.png`), Buffer.from(zoom, 'base64'));
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(ok ? 'M2 RENDER PIXELS: PASS' : 'M2 RENDER PIXELS: FAIL');
if (!ok) process.exitCode = 1;
