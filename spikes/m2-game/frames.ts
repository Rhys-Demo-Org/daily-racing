// Captures candidate reference frames (HANDOVER §2.3) from the real build (throwaway spike).
//   pnpm build && node spikes/m2-game/inputs.ts 1 2600 > /tmp/inputs.json
//   node spikes/m2-game/frames.ts /tmp/inputs.json <outDir> <tick,tick,...>
// Starts Dust Bowl with seed 1, freezes real time, plays the autopilot inputs through the driver and
// screenshots at each tick, at 844x390 (touch) and 1440x900.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from '@playwright/test';

const [inputsPath = '/tmp/inputs.json', OUT = '/tmp/frames', tickList = '245,450,800,1400,2000'] = process.argv.slice(2);
const inputs = JSON.parse(readFileSync(inputsPath, 'utf8')) as unknown[];
const ticks = tickList.split(',').map(Number).sort((a, b) => a - b);
mkdirSync(OUT, { recursive: true });
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0] as string;
  const path = join('dist', url === '/' ? 'index.html' : url);
  try {
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((r) => server.listen(4175, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, h, touch] of [[844, 390, true], [1440, 900, false]] as const) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4175/');
  await page.waitForFunction(() => document.fonts.status === 'loaded' && !!(window as unknown as { __racer?: unknown }).__racer);
  await page.evaluate(() => {
    const r = (window as unknown as { __racer: { startRace: (o: unknown) => void; freeze: () => void } }).__racer;
    r.startRace({ track: 'dust-bowl', seed: 1 });
    r.freeze();
  });
  let at = 0;
  for (const t of ticks) {
    const chunk = inputs.slice(at, t);
    at = t;
    const s = await page.evaluate((c) => (window as unknown as { __racer: { play: (i: unknown[]) => { cars: { x: number; z: number; y: number }[] } } }).__racer.play(c), chunk);
    const car = s.cars[0];
    console.log(`${w}x${h} tick ${t}: x=${car?.x.toFixed(1)} z=${car?.z.toFixed(1)} y=${car?.y.toFixed(2)}`);
    await page.screenshot({ path: `${OUT}/${w}x${h}-t${t}.png` });
  }
  await ctx.close();
}
await browser.close();
server.close();
