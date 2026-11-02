# B02 results screen: post-build review (2026-11-02)

Independent audit of PR #10 (`daily/2026-10-31`) against `spec.md`, UI_RULES and CLAUDE.md, then a
code review and refactor. The owner had play-tested it, so the look and behaviour are unchanged
apart from the bugs below.

## Spec audit

| AC | Implemented | Test proves it (fails on main) |
|---|---|---|
| AC1 stripes, label, track, best-lap chip | yes | yes |
| AC2 headers, one row per car, driver labels, times | yes | yes |
| AC3 GAP en dash / +s.cc / +m:ss.cc | yes | yes (fixture positions made consistent with the sim) |
| AC4 unfinished cars last with dashes, filled in later, no-op syncs touch no DOM | yes | yes |
| AC5 one player row, `--ui-deal-index` per row | yes | yes (fixture positions made consistent with the sim) |
| AC6 roundel ordinal, `ordinal()` | yes | yes |
| AC7 RETRY / NEXT RACE once per click, focus, reset clears rows, no inline colour | yes | yes |
| AC8 `nextTrackId` wraps, unknown throws | yes | yes |

Backlog `done_when`: RETRY restarts the same track and NEXT RACE loads the next registered track
(`game.ts`); with one registered track NEXT RACE replays Dust Bowl with a new seed, as specified.

UI_RULES: tokens only, motion only on transform / box-shadow / visibility, rows dealt 40 ms apart
then the roundel stamps (stamp ease, from 1.25), reduced motion cuts all of it, cream on rally-red
only at hud-l 800+. Layering: the results screen reads only `RacerView` fields through race-ui; no
env sniffing; nothing registered by hand.

## Findings

| Sev | Where | Finding | Done |
|---|---|---|---|
| Bug (low) | `src/ui/results-screen.ts` `update` | Re-rendered only when a finish tick changed, so unfinished cars that swapped places after the screen opened kept their stale order (only visible with 3+ cars). | `update` now also compares positions. Test: `tests/ui/results-review.test.ts`. |
| Bug (low) | `src/ui/results-screen.ts` `show` | A one-lap track read "RACE COMPLETE · 1 LAPS". | Singular for 1. Test added. |
| Duplication | `results-screen.ts` `finishingOrder` | Re-derived the sim's ordering (`positions()` in `src/sim/race.ts`), so the table and roundel could disagree with the HUD position. | Table sorted by the sim `position`, roundel shows `racers[0].position`. `ResultRacer` is now `Pick<RacerView, …>` instead of a parallel interface. |
| Duplication | `results-screen.ts`, `race-ui.ts` | Two copies of `ticksToMs`. | One export in `format.ts`. |
| Duplication | `results-screen.ts`, `start-screen.ts` | Triple-stripe markup copied. | `stripes()` in `dom.ts`, used by both. |
| Duplication | `results.css` | Navy ground / safe-area padding copied from `.ui-start`; row and roundel typography copied from `.ui-value`; `__head`/`__side` and `__table`/`__body` were identical flex columns; `ui-results-stamp` duplicated `ui-results-deal` except scale and end shadow. | Shared `.ui-start, .ui-results` rule in `screens.css`; rows and roundel take `ui-value`; merged into `__column` / `__rows`; one keyframe parameterised by `--ui-drop-scale` and `--ui-deal-shadow`. |
| Dead code | `results-screen.ts` | `ui-results__cell` class had no CSS. | Removed. |
| Naming | `results-screen.ts` | `cell()` built column headers and `td()` built cells. | `th()` for headers, cells built inline. |
| Simplification | `format.ts` `formatGap` | String slicing with `Number()` round trip. | `formatTime(ms).replace(/^0:0?/, '')`, same output incl. rounding into a minute (test added). |

## Not changed (owner to decide)

- `finish-panel.ts` (and its `.ui-finish__*` CSS) is now unused by the game but stays: tests on
  main import it and tests are append-only. It can go once those tests are retired by the owner.
- The `--ui-deal-index` / `--ui-deal-count` inline custom properties are written through `h()`'s
  attribute map, which side-steps the spirit of `source-rules.test.ts` ("no inline styles from
  TS"). AC5 requires the inline property, so it stays; they never carry a colour.
- Gaps are rounded independently of the two times, so a gap can differ by 0.01 from the
  difference of the displayed times (standard timing practice).
- The layout fits 844×390 with today's 2 cars; with 5+ cars the table would need a smaller row
  or scrolling. Needs a design call when more cars arrive.
- The motion for rows and roundel is the builder's reading of UI_RULES §7; a design check against
  board 05 would confirm it (builder notes).

## LOC (src only, vs main)

Before review: +349 / −13. After: +314 / −19. `results-screen.ts` 147 → 124,
`results.css` 145 → 119.

## Gates

The branch predated main's live-mode harness (PR #8), so G8 first failed on 17 protected files
that main had changed. `origin/main` was merged in (no conflicts); `run-gates.sh` against
origin/main `8fd4fa8` then passed G1 (393/393 tests), G2, G3 and G8.

## Merge with B01 (2026-11-02)

PR #9 (B01 pause screen) landed on main first, so `origin/main` (51b2ae2) was merged in.

- **Conflicts:** `src/game.ts`, `src/ui/race-ui.ts`, `src/ui/dom.ts` (`screens.css` auto-merged).
  - `game.ts`: kept B01's `restart` / `setPaused` wiring and added NEXT RACE. RESTART RACE (pause)
    and RETRY (results) are the same `restart` action, so they reset identical state.
  - `race-ui.ts`: builds the HUD (with the PAUSE button), results screen and pause screen; one
    `RaceUiOptions` covers both screens' callbacks. The finish panel is no longer built.
  - `dom.ts`: both helpers kept (`stripes()`, `hatch()`). `stripes()` takes an optional extra
    class, and the pause card now uses it instead of its own copy of the stripe markup.
- **Interactions:** pausing was already refused once the player has finished (the same condition
  that shows the results), and the real-time loop is stopped while paused, so results can't open
  under the pause card in play. The one gap was a driver `play()`/`step()` that finishes the race
  while paused: it now drops the pause first, so the results screen replaces the pause card.
- **Tests:** `tests/game/pause-results.test.ts` (5): Esc / PAUSE ignored on the results screen;
  no results while paused, results after resume + finish; driver finish while paused swaps the
  screens; RESTART RACE and RETRY give equal state; RETRY'd race can pause again, NEXT RACE
  loads the next track unpaused.
- **Gates:** G1 (413/413), G2, G3, G8 pass against main 51b2ae2.
