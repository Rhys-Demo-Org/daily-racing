# Phase 1 backlog

Status: **APPROVED** by the owner, 2026-10-29.

Nightly Phase 1 runs build these items. The harness, not the agent, picks the next one: the first
item (in file order) with no merged or open PR labelled `backlog:<ID>` whose `depends_on` items are
all **merged**. When every item is merged, Phase 2 (invention) starts. The owner may append items
at any time; Phase 2 then pauses until they are merged.

Format (parsed by the harness, keep it exact):
- `## <ID> · <Title>` where ID is `B` + two digits, unique, never reused.
- `depends_on:` a comma-separated list of IDs, or `none`.
- `scope:` what to build, with the mockup it comes from.
- `done_when:` the behaviour the spec's acceptance criteria must cover.

Every item must fit gate 11 (≤ 800 changed lines in `src/` excluding tests and track JSON,
≤ 12 changed files, track JSON ≤ 300 lines) and the style rules in `guardrails/design/UI_RULES.md`.
Each item assumes the Phase 0 core: Dust Bowl, one player car, one bot opponent, the race HUD
(POS, LAP, minimap, TIME + BEST), touch controls, countdown, a plain start screen and finish panel.

## B01 · Pause screen (S4)
depends_on: none
scope: Pause button (top-right HUD stack, beside TIME) and Esc key. Ink hatch overlay wipes in
over the frozen scene, then the PAUSED card drops in: navy header with "LAP x/3 · m:ss.cc", the
triple stripe, and three buttons: RESUME (rally-red, focused), RESTART RACE (cream), QUIT TO MENU
(navy). The simulation stops stepping while paused; touch controls go back to active on resume.
Mockup: `mockups/S4-pause.png`; motion: board 05.
done_when: pausing freezes sim time and race timer; resume continues from the identical state;
restart starts a fresh countdown on the same track; quit returns to the start screen; Esc and the
HUD button both toggle pause.

## B02 · Results screen (S5)
depends_on: none
scope: Replace the Phase 0 finish panel with the S5 results screen: solid navy ground, triple
stripe across the top, "RACE COMPLETE · 3 LAPS" label, track name, big placing roundel (1ST/2ND…,
rally-red), the player's best lap of this race in a mustard chip, and a table of POS / DRIVER /
TIME / GAP with rows dealt 40 ms apart and the player's row in rally-red. RETRY and NEXT RACE
buttons (NEXT RACE goes to the next registered track, wrapping). Drivers without names yet show
as "YOU · #1" and "CPU · #n".
Mockup: `mockups/S5-results.png`.
done_when: finishing a race shows one row per car in finishing order with correct times and gaps
(leader "–"); placing roundel matches the player's position; RETRY restarts the same track;
NEXT RACE loads the next track.

## B03 · AI liveries and driver roster
depends_on: none
scope: A data-only driver roster in `src/content/` with the five AI drivers from the mockups:
KOSKI #7 mustard, BRUNO #23 navy, DEL RIO #4 teal, MAGS #9 cream, OTTO #12 grass; player is YOU #1
rally-red with cream stripe and ▼ marker. Car builder applies each livery: body colour, stripe,
race number on the cream roof roundel, navy cabin (teal cabin on the navy car), ink wheels. AI
cars are never rally-red. Results/finish UI uses roster names.
Mockups: S1–S2, S5, desktop HUD; rules: UI_RULES §8.
done_when: each roster entry builds a car whose palette indices match its livery; no AI livery
uses rally-red; the navy car has a teal cabin; the bot in a race uses the first roster entry.

## B04 · Six-car grid
depends_on: B03
scope: Races start with the player plus five bots on a staggered grid behind the start band, one
per roster entry. Bots get seeded variation in line and pace so they spread out. POS reads "x/6";
minimap shows one dot per car in its body colour (player dot rally-red, drawn last).
Mockups: S1–S2, desktop HUD.
done_when: a race has six cars on distinct grid slots; bot laps on every track still finish with
all six cars; POS denominator is 6; minimap has six correctly coloured dots.

## B05 · Desktop HUD and keycap legend
depends_on: none
scope: On desktop (no touch, viewport ≥ the desktop breakpoint) the HUD uses the desktop type
sizes and ×1.45 scale, 32 px margins and 4 px outlines; touch controls are hidden. A keycap
legend panel sits bottom-left for the first lap only, listing the bindings that exist today
(← → steer, ↑ gas, ↓ brake, Esc pause if B01 is merged). Keycaps use SVG arrow icons, not glyphs.
Mockup: `mockups/desktop-race-hud-1440x900.png`.
done_when: at 1440×900 with a mouse-only device the HUD uses desktop tokens and no touch controls
render; the legend shows during lap 1 and is gone from lap 2.

## B06 · Gamepad controls
depends_on: none
scope: Standard-mapping gamepads via the Gamepad API: left stick / d-pad steer (analogue steer
mapped onto the existing input range), right trigger gas, left trigger brake/reverse, A to
confirm on menus. Input is polled once per sim step into the same `CarInput` as keyboard and touch.
done_when: a mocked gamepad produces the same `CarInput` values as the equivalent keys; stick
dead-zone stops drift at rest; menus can be started with A.

## B07 · Best-lap persistence and new-best chip
depends_on: none
scope: Store the best lap per track in `localStorage` (wrapped in try/catch; works without it).
The HUD BEST chip shows the stored best ("-:--.--" if none). When a lap beats it, a mustard
"NEW BEST" chip slides out from under the TIME panel (UI_RULES §7) and the result chip on the
finish/results screen says "NEW BEST LAP".
Mockups: S1–S2 (BEST chip), S5 (best lap chip).
done_when: a faster lap updates the stored and displayed best; a slower lap doesn't; the chip
appears only on a new best; the game runs when storage throws.

## B08 · Title and track select (S6) with stripe screen change
depends_on: B07
scope: Replace the Phase 0 start screen with S6: navy title panel ("DAILY AI RACER", triple
stripe, player car), dirt ground with SELECT TRACK and one card per registered track (outline
thumbnail drawn from the track's centreline as SVG, name, stored best), mustard selected card,
RACE button. Screen changes use the triple-stripe sweep (250 ms, stripes 40 ms apart); entering a
race uses the chequer band. The settings button in the mockup is out of scope (no settings
design exists). Mockup: `mockups/S6-title-track-select.png`.
done_when: every registered track has a card; selecting a card and pressing RACE starts that
track; each card shows that track's stored best; the stripe sweep runs between screens.

## B09 · HUD event motion
depends_on: none
scope: The race HUD moves on events per UI_RULES §7 and board 05: position digit rolls and its
panel bumps (×1.12) on a position change; lap panel stamps on a new lap; HUD panels slide in from
their own edge at race start; touch controls pop 0.9→1 when woken and retract their shadow when
resting. Transform / box-shadow / clip-path / visibility only; reduced motion keeps press only.
done_when: each event adds its motion class with the token duration and easing; with
`prefers-reduced-motion` only the press sink remains.

## B10 · Track: Hay Loop
depends_on: none
scope: A second track, "Hay Loop" (≈52 s lap, 3 laps): a longer dirt ribbon with an S-bend and a
tight hairpin loop at one end, as in the S6 thumbnail. Hay bale rows line the inside of the
hairpin, tyre stacks on the outside, cone trees in the infield, one ramp on the back straight.
Pure JSON in `src/content/tracks/`, using existing prop kinds only.
Mockup: S6 (thumbnail and name).
done_when: the track registers by file convention; the bot finishes 3 laps from every test seed
with a median lap time near 52 s; the scene contains the listed prop kinds.

## B11 · Track: Pine Ridge and the lock rule
depends_on: B08, B10
scope: A third track, "Pine Ridge": dense cone-tree forest, a sharp angular layout as in the S6
thumbnail, two ramps. In track select it starts locked (dark-dirt card, padlock roundel, best
"-:--.--") and unlocks once the player has finished a race on Hay Loop (stored like best laps).
Mockup: S6. Lock rule approved by the owner.
done_when: the track registers and the bot finishes it; its card is locked and not selectable
until a Hay Loop finish is recorded, then unlocked.

## B12 · Pickups and the action button
depends_on: none
scope: Mustard pickup boxes placed on tracks (declared in track JSON, opt-in per track so existing
replays don't change; added to Dust Bowl only). Driving through one grants a single boost: the
action button (⌀64, above GAS, lightning icon) and Space on desktop fire it; the action button
"pops" when a pickup is collected. Boost is a short deterministic speed bump in the sim.
Mockups: S1–S2 (action button), desktop HUD (SPACE power-up keycap).
done_when: collecting a pickup arms the action control; firing it raises speed for a fixed number
of ticks then returns to normal; pickups respawn after a fixed time; tracks without pickups behave
exactly as before (replays unchanged).
