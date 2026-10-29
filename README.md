# daily-racing

A browser arcade racer that an AI builds one feature a day.

Short dirt-track races with chunky toy cars, drifts, jumps, hay bales and tyre stacks, seen from a
fixed tabletop camera. Mobile-first, installable as a PWA. The look is a 70s rally toy diorama:
ten colours, low-poly meshes built in code, toon shading, ink outlines, no textures.

## The experiment

Every night an unattended Claude agent ships one feature or level as a pull request. The owner
reviews and merges. Nothing else is human-made: code, geometry, ideas and tests all come from AI.

1. **Phase 0 (now):** interactive sessions build a small playable core and the harness that lets
   nightly runs build, test and judge themselves.
2. **Phase 1:** nightly runs work through [`guardrails/BACKLOG.md`](guardrails/BACKLOG.md).
3. **Phase 2:** the agent invents something new each night, within the style rules.

The harness assumes the builder will take any shortcut that turns the checks green, so every check
is scripted, runs from `main`'s copy of the gates, and sits outside the builder's reach.

## How a nightly run works

A systemd timer starts `harness/daily.sh` at 02:00 London time on a dedicated VM. Everything runs in
a pinned container with no network except the Anthropic API.

1. **Pick:** the next backlog item (Phase 1), or an AI-ideated feature (Phase 2). Sundays are
   maintenance only.
2. **Build:** `claude -p` implements it with tests for each acceptance criterion. It cannot commit,
   push or reach GitHub.
3. **Gate:** scripted checks for types, tests, bot laps, physics replays, protected files, palette,
   performance and size. Failures go back to the builder, up to 2 retries.
4. **Judge:** a separate, read-only Claude scores the diff and screenshots against the design rules.
5. **PR:** the harness opens the pull request with the spec, gate results, verdict and screenshots.

Full spec: [`HANDOVER.md`](HANDOVER.md). Plan and deviations: [`plans/phase0-plan.md`](plans/phase0-plan.md).
Progress: [`PHASE0_STATUS.md`](PHASE0_STATUS.md).

## Play it

Needs Node 24 and pnpm (via Corepack).

```sh
git clone https://github.com/Rhys-Demo-Org/daily-racing.git && cd daily-racing
corepack enable
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev            # open http://localhost:5173
```

To play on a phone on the same network, run `pnpm dev --host` and open the printed address. Hold the
phone in landscape.

| | Keyboard | Touch |
|---|---|---|
| Steer | ← → or A D | left and right pads |
| Gas | ↑ or W | GAS |
| Brake / reverse | ↓ or S | BRAKE |

Three laps of Dust Bowl against one bot.

## Tech stack

TypeScript 6 (strict) · Three.js · Vite + vite-plugin-pwa · Vitest · Playwright · Node 24 · pnpm.
The harness uses Docker, systemd and Claude Code (headless).

- **Simulation:** deterministic 60 Hz fixed step, seeded RNG, runs headless in Node (`src/sim`).
- **Rendering:** procedural meshes; a palette-index shader that cannot output off-palette colours.
- **Design:** one token file ([`guardrails/design/tokens.json`](guardrails/design/tokens.json)) generates
  the palette, CSS variables and TS constants. The rules live in
  [`UI_RULES.md`](guardrails/design/UI_RULES.md).
- **Dependencies are frozen.** Exact pins and a lockfile that nightly runs cannot change.

## Development

```sh
pnpm typecheck      # tsc over src (browser) and tests/scripts (node)
pnpm test           # Vitest
pnpm build          # production build + PWA
```

The harness runs everything inside the pinned toolchain image
(`harness/container/build.sh`, then `harness/scripts/in-container.sh -- <command>`). Agents working
in this repo should start with [`CLAUDE.md`](CLAUDE.md).

## Licence

[MIT](LICENSE). Fonts are under the SIL Open Font Licence
([`public/fonts/OFL.txt`](public/fonts/OFL.txt)).
