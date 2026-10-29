// M2 UI preview (throwaway). Renders the HUD with sample values over a flat grass ground, plus the
// touch controls. Query params (spike only):
//   ?state=race (default) | countdown | go | start | finish | resting | pressed
//   ?step=3|2|1 (countdown step, default 2)
import '../../guardrails/generated/tokens.css';
import '../../src/ui/base.css';
import './preview.css';
import track from '../../src/content/tracks/dust-bowl.json';
import { createInput } from '../../src/input/index.ts';
import { createCountdown, type CountdownStep } from '../../src/ui/countdown.ts';
import { createFinishPanel } from '../../src/ui/finish-panel.ts';
import { createHud } from '../../src/ui/hud.ts';
import { createStartScreen } from '../../src/ui/start-screen.ts';
import { createTouchControls } from '../../src/ui/touch-controls.ts';
import type { HudState } from '../../src/ui/types.ts';

declare global {
  interface Window {
    __uiPreview: { ready: boolean; touchVisible: boolean; read: () => unknown; log: string[] };
  }
}

const params = new URLSearchParams(location.search);
const state = params.get('state') ?? 'race';
const app = document.getElementById('app') as HTMLElement;
const log: string[] = [];

/** Closed Catmull-Rom through the coarse centreline, like the sim's dense layout. */
function smooth(pts: [number, number][], n = 8): [number, number][] {
  const out: [number, number][] = [];
  const at = (i: number): [number, number] => pts[(i + pts.length) % pts.length] as [number, number];
  for (let i = 0; i < pts.length; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

const outline = smooth(track.centreline as [number, number][]);
const on = (i: number): { x: number; z: number } => {
  const p = outline[i % outline.length] as [number, number];
  return { x: p[0], z: p[1] };
};
const hudState: HudState = {
  position: state === 'countdown' || state === 'go' ? 4 : 2,
  carCount: 6,
  lap: 1,
  laps: 3,
  timeMs: state === 'countdown' || state === 'go' ? null : 6120,
  bestLapMs: null,
  minimap: {
    outline,
    cars: [
      { ...on(30), colour: 'mustard', player: false },
      { ...on(52), colour: 'teal', player: false },
      { ...on(74), colour: 'cream', player: false },
      { ...on(96), colour: 'navy', player: false },
      { ...on(112), colour: 'grass', player: false },
      { ...on(40), colour: 'rally-red', player: true },
    ],
  },
};

const ground = document.createElement('div');
ground.className = 'preview-ground';
app.append(ground);

const hud = createHud(app);
hud.update(hudState);
const touch = createTouchControls(app);
const input = createInput({ touchZones: () => touch.zones(), touchListener: touch.machine });

if (state === 'resting') {
  // Never woken: controls start resting.
} else {
  touch.wake();
}
if (state === 'pressed') {
  touch.machine.press('left');
  touch.machine.press('gas');
}

if (state === 'countdown' || state === 'go') {
  const cd = createCountdown(app);
  const step = Number(params.get('step') ?? 2) as CountdownStep;
  for (const s of [3, 2, 1, 0] as const) {
    cd.show(s);
    if (s === (state === 'go' ? 0 : step)) break;
  }
}

if (state === 'start') {
  hud.setVisible(false);
  touch.setVisible(false);
  createStartScreen(app, { onRace: () => log.push('race'), subtitle: 'Dust Bowl · 3 laps' }).show();
}

if (state === 'finish') {
  touch.setVisible(false);
  createFinishPanel(app, { onRaceAgain: () => log.push('again') }).show({ timeMs: 134800, bestLapMs: 40370 });
}

window.__uiPreview = {
  ready: true,
  get touchVisible() {
    return touch.visible;
  },
  read: () => input.read(),
  log,
};
