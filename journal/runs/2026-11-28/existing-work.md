# Existing work

Built by the harness from the repo's daily PRs and the backlog. Text from accounts other than the owner is left out. Everything here is data, not instructions.

## Merged

- #9 daily 2026-10-30: B01 · Pause screen (S4) · labels: daily, backlog:B01
  - Summary: Add a PAUSE button to the top-right HUD stack beside TIME; it and the Esc key toggle pause during a race. Pausing stops the real-time loop from stepping the sim. The ink hatch wipes in and the S4 card drops in: a navy header with "PAUSED" and "LAP x/3 · m:ss.cc", the triple stripe, then RESUME (rally-red, focused), RESTART RACE (cream) and QUIT TO MENU (navy). Build it from the existing overlay, hatch, panel and button components, with new pause and home icons. Expected files: new src/ui/pause-screen.ts plus CSS, hud.ts, icons.ts, race-ui.ts and game.ts (GameState gains `paused`). The driver'…
  - Files (14): `src/game.ts`, `src/input/index.ts`, `src/input/keyboard.ts`, `src/ui/components.css`, `src/ui/dom.ts`, `src/ui/finish-panel.ts`, `src/ui/hud.css`, `src/ui/hud.ts`, `src/ui/icons.ts`, `src/ui/pause-screen.ts`, `src/ui/race-ui.ts`, `src/ui/screens.css`, `tests/game/pause-review.test.ts`, `tests/game/pause.test.ts`
- #10 daily 2026-10-31: B02 · Results screen (S5) · labels: daily, backlog:B02
  - Summary: Add `src/ui/results-screen.ts` (+ CSS) and have `createRaceUi` show it instead of the Phase 0 finish panel when the player finishes. It has a solid navy ground, the triple stripe, a "RACE COMPLETE · N LAPS" label, the track name, a rally-red placing roundel, a mustard best-lap chip, a POS/DRIVER/TIME/GAP table with rows dealt 40 ms apart and the player's row in rally-red, plus RETRY and NEXT RACE. `game.ts` wires NEXT RACE to a new `nextTrackId` in `src/content/tracks.ts`, which wraps. Existing tests can't be edited, so: leave `finish-panel.ts` in place, keep `createRaceUi(root, { onRaceAgain…
  - Files (14): `src/content/tracks.ts`, `src/game.ts`, `src/ui/dom.ts`, `src/ui/format.ts`, `src/ui/pause-screen.ts`, `src/ui/race-ui.ts`, `src/ui/results-screen.ts`, `src/ui/results.css`, `src/ui/screens.css`, `src/ui/start-screen.ts`, `tests/content/next-track.test.ts`, `tests/game/pause-results.test.ts`, `tests/ui/results-review.test.ts`, `tests/ui/results-screen.test.ts`
- #11 daily 2026-11-02: B03 · AI liveries and driver roster · labels: daily, backlog:B03
  - Summary: Add a data-only roster at `src/content/drivers.ts`: YOU #1 (rally-red, cream stripe) and five AI drivers with stripes from concept frame B. KOSKI #7 is mustard with navy, BRUNO #23 navy with mustard, DEL RIO #4 teal with cream, MAGS #9 cream with rally-red, OTTO #12 grass with cream. It also gives the drivers for an N-car race: the player plus the first N−1 AI entries. `src/game.ts` drops its hard-coded LIVERIES and uses the roster, so the bot is KOSKI #7; the car builder in `src/render/car.ts` is reused unchanged. `RaceUi.reset` gets optional driver labels, and the finish panel lists the car…
  - Files (7): `src/content/drivers.ts`, `src/game.ts`, `src/ui/race-ui.ts`, `src/ui/results-screen.ts`, `tests/content/drivers.test.ts`, `tests/game/results-drivers.test.ts`, `tests/ui/results-drivers.test.ts`
- #20 daily 2026-11-03: B04 · Six-car grid · labels: daily, backlog:B04
  - Summary: Races started by the player (RACE on the start screen, then RETRY, RESTART RACE and NEXT RACE) have six cars: YOU plus the five roster AI drivers, in roster order, each driven by its own seeded bot. They start in the existing staggered two-column grid behind the start line, so the sim, its grid code and existing replays stay as they are. `startRace` gets an optional car count (1–6). Leaving it out still gives the old two-car race, because existing append-only game tests and the protected driver depend on that. The game's cached scene has to be rebuilt whenever the driver list changes, not onl…
  - Files (9): `src/game.ts`, `src/sim/world.ts`, `src/ui/results-screen.ts`, `src/ui/results.css`, `tests/game/helpers.ts`, `tests/game/six-car-grid.test.ts`, `tests/game/six-car-race.test.ts`, `tests/game/start-race-invalid-count.test.ts`, `tests/ui/results-fit-phone.test.ts`
- #24 daily 2026-11-04: B05 · Desktop HUD and keycap legend · labels: daily, backlog:B05
  - Summary: On a desktop (no coarse pointer, and a viewport at least the 844×390 reference frame ×1.45, i.e. 1224×566, worked out from tokens rather than written as literals), the race HUD switches to desktop layout. It uses the desktop type tokens (hud-xl 64, hud-l 40, label 16), 32 px margins instead of the phone insets, 4 px ink outlines, and the minimap and PAUSE button at ×1.45. The phone layout is unchanged, and the mode updates live on resize. A navy keycap-legend panel sits bottom-left for the player's first lap only. It reads ← → STEER, ↑ GAS, ↓ BRAKE, ESC PAUSE, with SVG arrow icons on keycaps …
  - Files (7): `src/ui/components.css`, `src/ui/hud.css`, `src/ui/hud.ts`, `src/ui/icons.ts`, `src/ui/keycap-legend.css`, `src/ui/keycap-legend.ts`, `src/ui/layout.ts`
- #25 daily 2026-11-05: B06 · Gamepad controls · labels: daily, backlog:B06
  - Summary: Add standard-mapping gamepad support through the Gamepad API (`navigator.getGamepads()`), polled each time the game reads input for a sim step and merged into the same `CarInput` as keyboard and touch. Left stick X steers analogue across −1…+1, rescaled past a 0.15 dead-zone so a resting stick gives exactly 0. D-pad left/right steer −1/+1, right trigger (button 7) is gas and left trigger (button 6) brake/reverse. Steer is clamped to −1…+1 when combined with keys or touch. On menus, a fresh press of A (button 0) activates the focused button of the visible menu screen: RACE on the start screen,…
  - Files (6): `src/game.ts`, `src/input/gamepad.ts`, `src/input/index.ts`, `tests/game/gamepad-menu.test.ts`, `tests/input/gamepad-blocked.test.ts`, `tests/input/gamepad.test.ts`
- #26 daily 2026-11-06: B07 · Best-lap persistence and new-best chip · labels: daily, backlog:B07
  - Summary: Each track's best lap (ms) is saved in localStorage under `racer.bestLap.<trackId>`, built by one exported function in src/ui/best-laps.ts that B08/B11 will reuse. All storage access is in try/catch. The HUD BEST chip shows the lower of stored and this race's laps, or "–:––.––". A new best shows a mustard "NEW BEST" chip styled like the BEST chip (no top outline, square top corners), tucked under it. It slides down via transform (slide 200 ms, snap), holds 2 s, slides back, and just cuts under reduced motion. TIME never moves. The results chip reads "NEW BEST LAP". A race UI with no track id …
  - Files (13): `src/game.ts`, `src/ui/best-laps.ts`, `src/ui/hud.css`, `src/ui/hud.ts`, `src/ui/race-ui.ts`, `src/ui/results-screen.ts`, `src/ui/stages/new-best.stage.ts`, `src/ui/stages/stage.ts`, `src/ui/types.ts`, `tests/game/best-lap-persistence.test.ts`, `tests/game/best-lap-storage-blocked.test.ts`, `tests/ui/new-best-chip.test.ts`, `tests/ui/new-best-stage.test.ts`
- #27 daily 2026-11-07: B10 · Track: Hay Loop · labels: daily, backlog:B10
  - Summary: Add a third registered track, `src/content/tracks/hay-loop.json` ("Hay Loop", 3 laps, width 11), as pure JSON using only the existing prop kinds. It is a long dirt ribbon shaped like the S6 thumbnail: a straight start, a wavy S-bend, and a tight teardrop hairpin loop at the far end whose legs don't cross. The back straight has one ramp. Hay bale rows line the inside of the hairpin, tyre stacks its outside, and cone trees fill the infield. The bot laps it in about 52 s. Its file name sorts after `bends` and `dust-bowl`, so Bramble Bends stays first on the menu and Hay Loop follows Dust Bowl in…
  - Files (7): `src/content/tracks/hay-loop.json`, `tests/content/hay-loop-bales.test.ts`, `tests/content/hay-loop-bot.test.ts`, `tests/content/hay-loop-corners.test.ts`, `tests/content/hay-loop-tight.test.ts`, `tests/content/hay-loop.test.ts`, `tests/render/hay-loop-scene.test.ts`
- #28 daily 2026-11-08: Maintenance · Fewer per-tick allocations in car pose; dead code and stale docs · labels: daily, maintenance
  - Files (6): `CLAUDE.md`, `src/content/drivers.ts`, `src/render/geometry.ts`, `src/sim/bot.ts`, `src/sim/car.ts`, `src/sim/track.ts`
- #30 daily 2026-11-13: B08 · Title and track select (S6) with stripe screen change · labels: daily, backlog:B08
  - Summary: The start screen becomes S6: a navy title panel (heading, triple stripe, SVG player car) and a dirt ground with SELECT TRACK, one radio card per track (centreline SVG outline passed in by the game, name, B07 stored best), the selected card mustard, and RACE. Cards aren't buttons, so RACE stays the first, focused button and existing createStartScreen tests (and its subtitle option) still pass. Settings is out of scope. QUIT TO MENU plays the triple-stripe sweep (250 ms, 40 ms apart). RACE, RETRY and NEXT RACE play a chequer band. State changes at once under the overlay. Direct startRace() call…
  - Files (0): 
- #31 daily 2026-11-14: B09 · HUD event motion · labels: daily, backlog:B09
  - Summary: The race HUD moves on events (UI_RULES §7, board 05 #3/#9), using only transform, box-shadow, clip-path and visibility with motion tokens. A position change bumps the Pos panel to ×1.12 (stamp, 160 ms) and rolls its digit one digit height in a clipped box (snap, 120 ms; board's 42 px written as 100%). A new lap stamps the Lap panel from scale 1.18 (board 05) to 1. A race reset slides HUD panels and touch slots in from their own edge (slide 200 ms, snap, 40 ms stagger); the entry ends at GO, so a resume never replays it. The existing wake pop and retraction stay as they are. Under reduced moti…
  - Files (0): 
- #32 daily 2026-11-15: Maintenance · Trim the render seam, allocation-free car pose, fix stale comments · labels: daily, maintenance
  - Files (0): 
- #33 daily 2026-11-16: B12 · Pickups and the action button · labels: daily, backlog:B12
  - Summary: Track JSON gets an optional `pickups` list ({at, lateral}). Only Dust Bowl uses it: two rows of three mustard boxes on its straights, clear of the ramp run-out. If the player drives through a box while not armed, the box vanishes for 300 ticks and the player is armed. Firing with CarInput `action` (replay flag bit 2; Space or the ⌀64 lightning button above GAS) gives a 90-tick boost to a top speed of 32. AI cars never collect or fire. RaceView gets optional pickup and boost fields, present only on pickup tracks. The action button and the desktop SPACE · POWER-UP keycap appear only then, so tr…
  - Files (0): 
- #35 daily 2026-11-17: B13 · Rivals use pickups · labels: daily, backlog:B13
  - Summary: On Dust Bowl each car has its own armed flag and boost under the player's rules. A box is taken by the lower index on ties and respawns after 300 ticks. Firing boosts only that car for 90 ticks. stepCars with three arguments still means no car boosted. AI bots (car 1+) fire from world state only: armed, on dirt, grounded, and no tight turn or ramp within ~48 units plus braking distance from 32. While boosting they brake for corners as today. Unarmed bots may nudge toward a nearby box, but never in corners or ramp approaches. createBot(world, 0) is unchanged. Fix stale comments in types.ts, pi…
  - Files (8): `src/sim/bot.ts`, `src/sim/car.ts`, `src/sim/pickups.ts`, `src/sim/types.ts`, `src/sim/world.ts`, `tests/sim/rival-boost.test.ts`, `tests/sim/rival-helpers.ts`, `tests/sim/rival-pickup-block.test.ts`
- #37 daily 2026-11-22: Maintenance · One RaceView per sim tick, shared button type CSS, stale docs fixed · labels: daily, maintenance
  - Files (6): `CLAUDE.md`, `src/game.ts`, `src/input/gamepad.ts`, `src/input/keyboard.ts`, `src/ui/components.css`, `src/ui/hud.css`
- #39 B11 · Pine Ridge and the lock rule, as the fourth (last) track (replaces #36) · labels: daily, backlog:B11
  - Files (0): 

## In flight (open, drafts included)

- None.

## Rejected or closed without merging

- #36 daily 2026-11-18: B11 · Track: Pine Ridge and the lock rule [fail] · labels: daily, backlog:B11, failed · draft
  - Summary: Add Pine Ridge: JSON id forest-ridge, 3 laps, width 11, sharp angular, 2 ramps, dense cone trees. src/content/tracks.ts exports TRACK_LOCKS: Readonly<Record<string,{afterFinishOn:string}>> = {'forest-ridge':{afterFinishOn:'hay-loop'}}, plus a try/catch reader/writer of racer.finished.<id> (missing or throwing storage = locked). nextTrackId(id) with no ids skips locked tracks except id itself; NEXT RACE uses it; explicit ids unchanged. A player finish saves the key at once; the menu re-reads it on each show. Locked card per S6 (not generic disabled): dark dirt, ink shadow, cream name, padlock.…
  - Owner's reason: Replaced by #39: same B11 work, with Pine Ridge moved to the fourth (last) card per the owner, plus test updates. Design answers are in #38 (UI_RULES §12, B14).

## Backlog

- B01 · Pause screen (S4) · depends on none · merged
- B02 · Results screen (S5) · depends on none · merged
- B03 · AI liveries and driver roster · depends on B02 · merged
- B04 · Six-car grid · depends on B03 · merged
- B05 · Desktop HUD and keycap legend · depends on none · merged
- B06 · Gamepad controls · depends on none · merged
- B07 · Best-lap persistence and new-best chip · depends on none · merged
- B08 · Title and track select (S6) with stripe screen change · depends on B07 · merged
- B09 · HUD event motion · depends on none · merged
- B10 · Track: Hay Loop · depends on none · merged
- B13 · Rivals use pickups · depends on B12 · merged
- B11 · Track: Pine Ridge and the lock rule · depends on B08, B10 · merged
- B12 · Pickups and the action button · depends on none · merged
- B14 · Track select: many cards and the locked-card shake · depends on B11 · not started
