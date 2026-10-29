// M2 UI preview runner (throwaway). Screenshots each state at 844×390 with touch, runs a live
// multi-touch check through CDP, and a computed-style scan like the future gate.
//
//   vite build -c spikes/m2-ui/vite.config.ts && node spikes/m2-ui/run.ts <outDir> [distDir]
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const DIST = process.argv[3] ?? '/tmp/m2-ui-dist';
const OUT = process.argv[2] ?? 'test-results/m2-ui';
mkdirSync(OUT, { recursive: true });
const palette = JSON.parse(readFileSync('guardrails/palette.json', 'utf8')) as { order: string[]; hex: Record<string, string> };
const allowed = new Set(
  palette.order.map((n) => {
    const v = Number.parseInt((palette.hex[n] as string).slice(1), 16);
    return `rgb(${v >> 16}, ${(v >> 8) & 255}, ${v & 255})`;
  }),
);

const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const p = (req.url ?? '/').split('?')[0] as string;
  const path = join(DIST, p === '/' ? 'index.html' : p);
  let body: Buffer;
  try {
    body = readFileSync(path);
  } catch {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
});
await new Promise<void>((r) => server.listen(4174, '127.0.0.1', r));

const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: ARGS });
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: false });

async function open(query: string): Promise<Page> {
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
  await page.goto(`http://127.0.0.1:4174/${query}`);
  await page.waitForFunction(() => window.__preview?.ready === true);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

/** Computed-style scan: palette colours only, no opacity/filter, fonts ≥ 13px, token families. */
async function scan(page: Page): Promise<string[]> {
  return page.evaluate((allowedList) => {
    const ok = new Set(allowedList);
    const problems: string[] = [];
    const colourOk = (c: string): boolean => c === 'rgba(0, 0, 0, 0)' || c === 'none' || ok.has(c) || c.startsWith('url(');
    for (const el of document.querySelectorAll('#app *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const tag = `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').split(' ').join('.')}`;
      const props = ['color', 'background-color', 'border-top-color', 'border-left-color', 'outline-color'];
      // fill/stroke only paint SVG.
      if (el instanceof SVGElement) props.push('fill', 'stroke');
      for (const prop of props) {
        const v = cs.getPropertyValue(prop);
        if (!colourOk(v)) problems.push(`${tag} ${prop}=${v}`);
      }
      const shadow = cs.boxShadow;
      if (shadow !== 'none') {
        // One hard shadow: "rgb(...) Xpx Ypx 0px 0px" with a palette colour and zero blur/spread.
        const m = shadow.match(/^(rgb\(\d+, \d+, \d+\)) -?[\d.]+px -?[\d.]+px 0px( 0px)?$/);
        if (!m || !ok.has(m[1] as string)) problems.push(`${tag} box-shadow=${shadow}`);
      }
      if (cs.opacity !== '1') problems.push(`${tag} opacity=${cs.opacity}`);
      if (cs.filter !== 'none') problems.push(`${tag} filter=${cs.filter}`);
      if (cs.backgroundImage !== 'none') problems.push(`${tag} background-image=${cs.backgroundImage}`);
      if (cs.mixBlendMode !== 'normal') problems.push(`${tag} blend=${cs.mixBlendMode}`);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
      if (hasText) {
        if (Number.parseFloat(cs.fontSize) < 13) problems.push(`${tag} font-size=${cs.fontSize}`);
        if (!/^("?Barlow Condensed"?|"?Atkinson Hyperlegible"?)/.test(cs.fontFamily)) problems.push(`${tag} font=${cs.fontFamily}`);
      }
    }
    return problems;
  }, [...allowed]);
}

const shots: [string, string, number][] = [
  ['race', '?state=race', 300],
  ['resting', '?state=resting', 300],
  ['pressed', '?state=pressed', 300],
  ['countdown-3', '?state=countdown&step=3', 400],
  ['countdown-2', '?state=countdown&step=2', 400],
  ['countdown-1', '?state=countdown&step=1', 400],
  ['go', '?state=go', 400],
  ['go-after', '?state=go', 1400],
  ['start', '?state=start', 300],
  ['finish', '?state=finish', 500],
];

let failures = 0;
for (const [name, query, wait] of shots) {
  const page = await open(query);
  await page.waitForTimeout(wait);
  const touchVisible = await page.evaluate(() => window.__preview.touchVisible);
  const problems = await scan(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name}: touchVisible=${touchVisible} styleProblems=${problems.length}`);
  for (const p of problems.slice(0, 10)) console.log('   ', p);
  failures += problems.length;
  await page.close();
}

// Live multi-touch through real touch events: left pad + gas at once, then lift the left only.
{
  const page = await open('?state=race');
  const cdp = await context.newCDPSession(page);
  const left = { x: 48 + 42, y: 390 - 21 - 40, id: 1 };
  const gas = { x: 844 - 48 - 50, y: 390 - 21 - 50, id: 2 };
  const slopMiss = { x: 48 - 13, y: 390 - 21 - 40, id: 3 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, gas] });
  await page.waitForTimeout(150);
  const both = await page.evaluate(() => window.__preview.read());
  await page.screenshot({ path: `${OUT}/touch-live.png` });
  // CDP lifts the listed points.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [left] });
  const gasOnly = await page.evaluate(() => window.__preview.read());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [slopMiss] });
  const miss = await page.evaluate(() => window.__preview.read());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  console.log('touch-live', JSON.stringify({ both, gasOnly, miss }));
  const ok =
    JSON.stringify(both) === JSON.stringify({ steer: -1, throttle: true, brake: false }) &&
    JSON.stringify(gasOnly) === JSON.stringify({ steer: 0, throttle: true, brake: false }) &&
    JSON.stringify(miss) === JSON.stringify({ steer: 0, throttle: false, brake: false });
  if (!ok) failures++;
  console.log(ok ? 'TOUCH: PASS' : 'TOUCH: FAIL');
  await page.close();
}

await browser.close();
server.close();
console.log(failures === 0 ? 'PREVIEW: PASS' : `PREVIEW: ${failures} problems`);
if (failures) process.exitCode = 1;
