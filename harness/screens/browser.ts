// Browser plumbing shared by the harness's page scripts (capture.ts: screenshots; probe.ts: DOM and
// style snapshots, performance counters): a static server for a harness build
// (harness/screens/vite.config.ts), Chromium with software WebGL, one context per viewport with a
// fake clock, and pages that fail on any page or console error. Runs inside the toolchain container,
// offline.
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, resolve, sep } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { Viewport } from './shots.ts';

/** The fake clock starts here and is paused one second later, once the page has loaded. */
export const EPOCH = Date.UTC(2026, 0, 1);

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

/** Serves `dist` on a free localhost port. */
export async function serve(distDir: string): Promise<{ origin: string; server: Server }> {
  const dist = resolve(distDir);
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    const path = resolve(dist, `.${url === '/' ? '/index.html' : url}`);
    try {
      if (!path.startsWith(dist + sep)) throw new Error('outside dist');
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

export function launch(extraArgs: readonly string[] = []): Promise<Browser> {
  return chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-gpu-rasterization', '--disable-partial-raster', ...extraArgs],
  });
}

/**
 * Installed in every page as window.__settle and called in the same task that renders a stage or
 * steps the race, so no frame is ever painted mid-animation (a layer rastered mid-animation can
 * keep that raster, which made edges differ between runs). Settled means every entry animation has
 * finished and every exit animation (one that ends hidden, like GO! sliding off) has not started.
 */
function settle(): void {
  for (const a of document.getAnimations()) {
    const frames = a.effect instanceof KeyframeEffect ? a.effect.getKeyframes() : [];
    if (frames.some((k) => k.computedOffset === 1 && k['visibility'] === 'hidden')) {
      a.pause();
      a.currentTime = 0;
    } else {
      a.finish();
    }
  }
}

/** A context for one viewport (phone: touch + mobile emulation), with window.__settle installed. */
export async function context(browser: Browser, v: Viewport): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    hasTouch: v.touch,
    isMobile: v.touch,
    serviceWorkers: 'block',
    locale: 'en-GB',
    timezoneId: 'UTC',
    reducedMotion: 'no-preference',
  });
  await ctx.addInitScript(`window.__settle = ${settle.toString()};`);
  return ctx;
}

/** Page errors and console errors per page; callers fail on any. */
export const pageErrors = new WeakMap<Page, string[]>();

/** Opens `origin + path` with the fake clock, recording page errors; pauses the clock once `ready` holds. */
export async function open(ctx: BrowserContext, origin: string, path: string, ready: string): Promise<Page> {
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  pageErrors.set(page, errors);
  await page.clock.install({ time: EPOCH });
  await page.goto(`${origin}${path}`);
  await page.waitForFunction(ready);
  await page.clock.pauseAt(EPOCH + 1000);
  return page;
}

/** Throws when `page` has had a page or console error. */
export function assertNoErrors(page: Page, what: string): void {
  const errors = pageErrors.get(page) ?? [];
  if (errors.length) throw new Error(`${what}: ${errors.join('; ')}`);
}

/** The stage names the harness build registers (src/ui/stages/*.stage.ts). */
export async function stageNames(ctx: BrowserContext, origin: string): Promise<string[]> {
  const probe = await open(ctx, origin, STAGES_PAGE, STAGES_READY);
  const names = await probe.evaluate(() => (window as unknown as { __stages: { names(): string[] } }).__stages.names());
  await probe.close();
  if (names.length === 0) throw new Error('no screen stages registered (src/ui/stages/*.stage.ts)');
  return names;
}

export const STAGES_PAGE = '/harness/screens/stages.html';
export const STAGES_READY = 'window.__stages';
export const GAME_READY = 'document.fonts.status === "loaded" && !!window.__racer';

/** Opens a fresh stages page and renders stage `name` in it, settled. */
export async function renderStage(ctx: BrowserContext, origin: string, name: string): Promise<Page> {
  const page = await open(ctx, origin, STAGES_PAGE, STAGES_READY);
  await page.evaluate((n) => {
    const w = window as unknown as { __stages: { render(n: string): void }; __settle(): void };
    w.__stages.render(n);
    w.__settle();
  }, name);
  // Layout first so every used font starts loading, then wait for them.
  await page.evaluate(async () => {
    void document.body.offsetHeight;
    await document.fonts.ready;
  });
  return page;
}
