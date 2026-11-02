// Screenshots every screen stage and a few race frames from a harness build
// (harness/screens/vite.config.ts) at each viewport, then writes <out>/index.json (see shots.ts).
// Runs inside the toolchain container via harness/scripts/screenshots.sh, offline.
//
//   node harness/screens/capture.ts <dist-dir> <out-dir>
//
// Determinism: a fixed race seed and bot inputs, Playwright's fake clock paused before any stage or
// race frame is shown (so the touch controls' timers never fire), CSS animations finished by the
// screenshot, software WebGL (SwiftShader) and device scale 1.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { createBot, createWorld, raceView, stepWorld, validateTrack, type CarInput } from '../../src/sim/index.ts';
import { checkIndex, planShots, RACE_SEED, raceMoments, VIEWPORTS, viewportName, type RaceMoment, type ShotEntry } from './shots.ts';

const [distArg, outArg] = process.argv.slice(2);
if (!distArg || !outArg) throw new Error('usage: node harness/screens/capture.ts <dist-dir> <out-dir>');
const dist = resolve(distArg);
const out = resolve(outArg);

/** Cars per race, as in the game (player + one bot opponent). */
const CARS = 2;
/** Give up on a race after this many ticks (5 minutes of sim time). */
const TICK_CAP = 60 * 300;
/** The fake clock starts here and is paused one second later, once the page has loaded. */
const EPOCH = Date.UTC(2026, 0, 1);

// --- race inputs: car 0 driven by a bot, exactly as the game's car 1 is, so the race is fixed ----
interface RacePlan {
  track: string;
  inputs: CarInput[];
  moments: RaceMoment[];
}

function planRace(file: string): RacePlan {
  const track = validateTrack(JSON.parse(readFileSync(file, 'utf8')));
  const world = createWorld(track, { seed: RACE_SEED, carCount: CARS });
  const bots = world.cars.map((_, i) => createBot(world, i));
  const inputs: CarInput[] = [];
  while (raceView(world).phase !== 'finished') {
    if (inputs.length >= TICK_CAP) throw new Error(`${track.id}: the bot did not finish in ${TICK_CAP} ticks`);
    const frame = bots.map((b) => b.input(world));
    inputs.push(frame[0] as CarInput);
    stepWorld(world, frame);
  }
  return { track: track.id, inputs, moments: raceMoments(inputs.length) };
}

const tracksDir = new URL('../../src/content/tracks/', import.meta.url).pathname;
const races = readdirSync(tracksDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => planRace(join(tracksDir, f)));

// --- static server for the build --------------------------------------------------------------------
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
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// --- browser ---------------------------------------------------------------------------------------
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-gpu-rasterization', '--disable-partial-raster'],
});

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

/** Page errors and console errors per page; any fails the run. */
const pageErrors = new WeakMap<Page, string[]>();

/** Opens `path` with the fake clock, failing on any page error; pauses the clock once loaded. */
async function open(ctx: BrowserContext, path: string, ready: string): Promise<Page> {
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

async function shoot(page: Page, shot: ShotEntry): Promise<void> {
  // Layout first so every used font starts loading, then wait for them.
  await page.evaluate(async () => {
    void document.body.offsetHeight;
    await document.fonts.ready;
  });
  const errors = pageErrors.get(page) ?? [];
  if (errors.length) throw new Error(`${shot.viewport} ${shot.kind} ${shot.name}: ${errors.join('; ')}`);
  await page.screenshot({ path: join(out, shot.path), caret: 'hide', scale: 'css' });
}

const shots: ShotEntry[] = [];
try {
  for (const v of VIEWPORTS) rmSync(join(out, viewportName(v)), { recursive: true, force: true });
  rmSync(join(out, 'index.json'), { force: true });
  let stageNames: string[] = [];
  for (const v of VIEWPORTS) {
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
    const probe = await open(ctx, '/harness/screens/stages.html', 'window.__stages');
    stageNames = await probe.evaluate(() => (window as unknown as { __stages: { names(): string[] } }).__stages.names());
    await probe.close();
    if (stageNames.length === 0) throw new Error('no screen stages registered (src/ui/stages/*.stage.ts)');
    const plan = planShots(
      stageNames,
      races.flatMap((r) => r.moments.map((m) => `${r.track}-${m.name}`)),
      [v],
    );
    mkdirSync(join(out, viewportName(v), 'stage'), { recursive: true });
    mkdirSync(join(out, viewportName(v), 'race'), { recursive: true });

    for (const shot of plan.filter((s) => s.kind === 'stage')) {
      const page = await open(ctx, '/harness/screens/stages.html', 'window.__stages');
      await page.evaluate((name) => {
        const w = window as unknown as { __stages: { render(n: string): void }; __settle(): void };
        w.__stages.render(name);
        w.__settle();
      }, shot.name);
      await shoot(page, shot);
      await page.close();
      shots.push(shot);
    }

    for (const race of races) {
      const page = await open(ctx, '/', 'document.fonts.status === "loaded" && !!window.__racer');
      await page.evaluate(
        ({ track, seed }) => {
          const r = (window as unknown as { __racer: { startRace(o: object): unknown; freeze(): void } }).__racer;
          r.startRace({ track, seed });
          r.freeze();
        },
        { track: race.track, seed: RACE_SEED },
      );
      let at = 0;
      for (const m of race.moments) {
        const phase = await page.evaluate(
          (chunk) => {
            const w = window as unknown as { __racer: { play(i: unknown[]): { race: { phase: string } | null } }; __settle(): void };
            const phase = w.__racer.play(chunk).race?.phase;
            w.__settle();
            return phase;
          },
          race.inputs.slice(at, m.tick),
        );
        at = m.tick;
        if (m.name === 'finished' && phase !== 'finished') throw new Error(`${race.track}: the game did not finish with the planned inputs (car count changed?)`);
        const shot = plan.find((s) => s.kind === 'race' && s.name === `${race.track}-${m.name}`) as ShotEntry;
        await shoot(page, shot);
        shots.push(shot);
      }
      await page.close();
    }
    await ctx.close();
  }
  const problems = checkIndex(shots);
  if (problems.length) throw new Error(`bad index: ${problems.join('; ')}`);
  writeFileSync(join(out, 'index.json'), `${JSON.stringify(shots, null, 2)}\n`);
  console.log(`captured ${shots.length} screenshots (${stageNames.length} stages, ${races.length} race(s)) into ${out}`);
} finally {
  await browser.close();
  server.close();
}
