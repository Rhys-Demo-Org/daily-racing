# B08 · Title and track select (S6) with stripe screen change

Date: 2026-11-13 · mode: backlog · backlog: B08

## Summary

The start screen becomes S6: a navy title panel (heading, triple stripe, SVG player car) and a dirt ground with SELECT TRACK, one radio card per track (centreline SVG outline passed in by the game, name, B07 stored best), the selected card mustard, and RACE. Cards aren't buttons, so RACE stays the first, focused button and existing createStartScreen tests (and its subtitle option) still pass. Settings is out of scope. QUIT TO MENU plays the triple-stripe sweep (250 ms, 40 ms apart). RACE, RETRY and NEXT RACE play a chequer band. State changes at once under the overlay. Direct startRace() calls (the driver) get no overlay, and reduced motion cuts it.

## Acceptance criteria

- **AC1**: AC1: The menu shows the label SELECT TRACK and a radiogroup named "Select track" with exactly one radio card per registered track, in registry order (Bramble Bends, Dust Bowl, Hay Loop today). Each card shows its track name and holds an SVG outline with a non-empty drawn path.
- **AC2**: AC2: Each card shows its stored best from localStorage key racer.bestLap.<trackId>, e.g. 40370 shows "BEST 0:40.37". A track with no stored value, an invalid value, or storage that throws shows "BEST –:––.––" and the menu still renders.
- **AC3**: AC3: Exactly one card has aria-checked="true", and on first load it is the first registered track. Clicking another card selects it and unselects the old one. With a card focused, ArrowRight/ArrowLeft move the selection to the next/previous card, wrapping at the ends.
- **AC4**: AC4: Selecting the Hay Loop card and pressing RACE starts a six-car race on Hay Loop (game state mode 'race', trackId 'hay-loop', 6 cars). After QUIT TO MENU the Hay Loop card is the selected one, and RACE stays the menu's focused primary button.
- **AC5**: AC5: If a track's stored best changes during a race (e.g. localStorage racer.bestLap.dust-bowl set to 39990), that card reads "BEST 0:39.99" after QUIT TO MENU.
- **AC6**: AC6: The title panel holds the DAILY AI RACER heading, the triple stripe (red, mustard, cream) and an SVG image of the player car with an accessible name containing "#1".
- **AC7**: AC7: Pressing QUIT TO MENU on the pause screen puts the menu on show at once, under a screen-change element ([data-screen-change="stripes"]) holding three stripes (red, mustard, cream). The element is gone 330 ms later (250 ms wipe + 2 × 40 ms stagger, fake timers).
- **AC8**: AC8: Pressing RACE on the menu, or RETRY or NEXT RACE on the results screen, shows a [data-screen-change="chequer"] band that is gone 330 ms later. Calling the game's startRace() directly (as the test driver does) adds no screen-change element.

## What you'll see

The opening menu now looks like the S6 mockup. A navy title panel with the game name, three stripes and the red #1 car is on the left. On the right is a dirt panel with a card for each track: its outline, name and your best lap, with the selected card in mustard and a red RACE button. Starting a race sweeps a chequered band across the screen, and quitting back to the menu sweeps the red, mustard and cream stripes.

## How to play-test

1. Open the preview in landscape on your phone; the menu shows SELECT TRACK with three track cards, each with a drawn outline and a BEST time (dashes if you've never raced it).
2. Tap the Hay Loop card: it turns mustard and the others go back to plain.
3. Tap RACE: a chequered band sweeps across and the race starts on Hay Loop.
4. Finish a lap, then tap PAUSE and QUIT TO MENU: the three stripes sweep across and the menu comes back with Hay Loop still selected.
5. Check that the Hay Loop card's BEST now shows the lap time you just set.

## Expected files

- `src/ui/start-screen.ts`
- `src/ui/screens.css`
- `src/ui/title.css`
- `src/ui/track-card.ts`
- `src/ui/title-car.ts`
- `src/ui/screen-change.ts`
- `src/ui/screen-change.css`
- `src/ui/types.ts`
- `src/game.ts`
- `src/ui/stages/start.stage.ts`
- `src/ui/stages/screen-change.stage.ts`
- `tests/ui/track-select.test.ts`
- `tests/ui/title-panel.test.ts`
- `tests/game/track-select-race.test.ts`
- `tests/game/screen-change.test.ts`

## Plan audit

Verdict: **approve** (round 1)

I'm approving the draft. It covers B08's scope and done_when, the S6 mockup and the UI_RULES screen-change and chequer-band rules cover its visuals, and the existing start-screen tests still pass (h1 text, RACE as first and focused button, subtitle option). No open PR touches its files, and nothing needs retiring. The four findings are minor and go to the builder: how the stripe reveal should look, keeping track counts out of the tests, and two test-seam notes.

- minor · design: UI_RULES says the new screen "cuts in under the red stripe". The draft switches state at once under the overlay. Done literally, the menu would show ahead of the stripes before they cover the old screen. Fix: Keep the DOM/state switch immediate, because existing pause and quit tests expect it. Visually, the outgoing screen should stay covered until the red stripe passes. For example, the overlay's leading edge hides what is ahead of it, and the new screen shows only behind the red stripe. Use the sweep easing (.6,0,.4,1), wipe 250 ms and stagger 40 ms tokens, with no literals.
- minor · testability: AC1 lists today's tracks (Bramble Bends, Dust Bowl, Hay Loop). If the test hard-codes three cards or those names, it breaks when B11 adds Pine Ridge, and tests are append-only. Fix: In the AC1 test, get the expected card count, names and order from the exported TRACKS list, not hard-coded values.
- minor · testability: The harness lint flags AC8 for naming startRace(). It is the public Game control surface that the driver and many existing tests already call, so it is acceptable. window.__racer.startRace would be the cleaner seam. Fix: Write the 'no overlay on direct start' half of AC8 against the driver's window.__racer.startRace, or Game.startRace as the existing game tests do. Do not reach into internal helpers.
- minor · testability: In AC7 and AC8, reduced motion cuts the overlay. If happy-dom's matchMedia reports reduced motion, or the code treats a missing matchMedia as reduced motion, the overlay assertions could pass or fail by accident. Fix: Treat a missing matchMedia as 'motion allowed'. In the tests, stub matchMedia explicitly. Optionally add a test that reduced motion adds no screen-change element.

Overlap with open PRs: The harness reports no file overlap. The only diff in /inputs, pr-29.diff, touches guardrails/manifest.json, tests/baselines/bot-laps.json and a new tests/game/best-lap-e2e.test.ts. None of those are in the draft's expectedFiles, and none of them change start-screen or screen-change behaviour, so building this now is safe.
