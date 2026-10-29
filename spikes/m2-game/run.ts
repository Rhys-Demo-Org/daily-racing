// M2 end-to-end check of the real build (throwaway; gates replace it later).
//   pnpm build && node spikes/m2-game/run.ts <outDir>
// Serves dist/, then at 844x390 (touch) and 1440x900: menu shot, a driver-staged race shot, a
// keyboard drive and a touch drive. Prints JSON results; exits 1 on any failed check.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const OUT = process.argv[2] ?? '/tmp/m2-game';
mkdirSync(OUT, { recursive: true });
const DIST = 'dist';
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
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

type S = { mode: string; race: { phase: string; countdown: number; raceTick: number } | null; cars: { x: number; z: number; speed: number }[] };
const state = (p: Page): Promise<S> => p.evaluate(() => (window as unknown as { __racer: { state: () => S } }).__racer.state());
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const checks: Record<string, boolean | string | number> = {};
let ok = true;
const check = (name: string, pass: boolean, detail: string | number = ''): void => {
  checks[name] = pass ? (detail === '' ? true : `ok ${detail}`) : `FAIL ${detail}`;
  ok &&= pass;
};

const browser = await chromium.launch({ args: ARGS });
for (const [w, h, touch] of [[844, 390, true], [1440, 900, false]] as const) {
  const tag = `${w}x${h}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('http://127.0.0.1:4174/');
  await page.waitForFunction(() => 'fonts' in document && document.fonts.status === 'loaded' && !!(window as unknown as { __racer?: unknown }).__racer);
  await page.screenshot({ path: `${OUT}/${tag}-menu.png` });
  check(`${tag} starts on menu`, (await state(page)).mode === 'menu');

  // Driver-staged race frame: through the countdown, then 2 s of throttle down the start straight.
  await page.evaluate(() => {
    const r = (window as unknown as { __racer: { startRace: (o: unknown) => void; freeze: () => void; step: (n: number, i?: unknown) => void } }).__racer;
    r.startRace({ track: 'dust-bowl', seed: 1 });
    r.freeze();
    r.step(60);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${tag}-countdown.png` });
  await page.evaluate(() => {
    const r = (window as unknown as { __racer: { step: (n: number, i?: unknown) => void } }).__racer;
    r.step(120);
    r.step(150, { steer: 0, throttle: true, brake: false });
    r.step(1, { steer: 0, throttle: true, brake: false });
  });
  await page.screenshot({ path: `${OUT}/${tag}-race.png` });
  const staged = await state(page);
  check(`${tag} staged race is racing`, staged.race?.phase === 'racing', staged.race?.phase ?? 'none');
  check(`${tag} staged car moved`, (staged.cars[0]?.speed ?? 0) > 10, (staged.cars[0]?.speed ?? 0).toFixed(1));

  // Real-time keyboard drive.
  await page.evaluate(() => (window as unknown as { __racer: { startRace: (o: unknown) => void; resume: () => void } }).__racer.resume());
  await page.evaluate(() => (window as unknown as { __racer: { startRace: (o: unknown) => void } }).__racer.startRace({ track: 'dust-bowl', seed: 2 }));
  await page.waitForFunction(() => (window as unknown as { __racer: { state: () => S } }).__racer.state().race?.phase === 'racing', null, { timeout: 15000 });
  const k0 = (await state(page)).cars[0];
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2000);
  await page.keyboard.up('ArrowUp');
  const k1 = (await state(page)).cars[0];
  const kd = Math.hypot((k1?.x ?? 0) - (k0?.x ?? 0), (k1?.z ?? 0) - (k0?.z ?? 0));
  check(`${tag} keyboard drives`, kd > 5, kd.toFixed(1));

  if (touch) {
    // Touch only: menu RACE by tap, then hold GAS with a finger.
    await page.evaluate(() => (window as unknown as { __racer: { showMenu: () => void } }).__racer.showMenu());
    await page.getByRole('button', { name: /race/i }).first().tap();
    await page.waitForFunction(() => (window as unknown as { __racer: { state: () => S } }).__racer.state().race?.phase === 'racing', null, { timeout: 15000 });
    const gas = await page.getByRole('button', { name: /accelerate|gas/i }).first().boundingBox();
    check(`${tag} gas button visible`, gas !== null);
    if (gas) {
      const cdp = await ctx.newCDPSession(page);
      const pt = { x: gas.x + gas.width / 2, y: gas.y + gas.height / 2, id: 1 };
      const t0 = (await state(page)).cars[0];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/${tag}-touch-gas.png` });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const t1 = (await state(page)).cars[0];
      const td = Math.hypot((t1?.x ?? 0) - (t0?.x ?? 0), (t1?.z ?? 0) - (t0?.z ?? 0));
      check(`${tag} touch gas drives`, td > 5, td.toFixed(1));
    }
  }
  check(`${tag} no page errors`, errors.length === 0, errors.join(' | ').slice(0, 300));
  await ctx.close();
}
await browser.close();
server.close();
console.log(JSON.stringify(checks, null, 2));
console.log(ok ? 'GAME: PASS' : 'GAME: FAIL');
if (!ok) process.exitCode = 1;
