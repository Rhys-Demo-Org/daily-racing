# B02 · Results screen (S5)

Date: 2026-10-31 · mode: backlog · backlog: B02

## Summary

Add `src/ui/results-screen.ts` (+ CSS) and have `createRaceUi` show it instead of the Phase 0 finish panel when the player finishes. It has a solid navy ground, the triple stripe, a "RACE COMPLETE · N LAPS" label, the track name, a rally-red placing roundel, a mustard best-lap chip, a POS/DRIVER/TIME/GAP table with rows dealt 40 ms apart and the player's row in rally-red, plus RETRY and NEXT RACE. `game.ts` wires NEXT RACE to a new `nextTrackId` in `src/content/tracks.ts`, which wraps. Existing tests can't be edited, so: leave `finish-panel.ts` in place, keep `createRaceUi(root, { onRaceAgain })` and the 3-arg `reset(laps, outline, colours)` valid (new inputs like `onNextRace`, track name and car numbers are optional), and give the results root the `ui-finish` class too.

## Acceptance criteria

- **AC1**: After `reset(3, outline, ['rally-red','mustard'], …)` with track name 'Dust Bowl', a `phase: 'finished'` sync shows a visible `.ui-results` screen containing a triple stripe of exactly 3 stripe elements, the label "Race complete · 3 laps" (case-insensitive), the text 'Dust Bowl' and a mustard best-lap chip with the player's best lap (lapTicks [2500,2400,2300] → '0:38.33').
- **AC2**: The results table has the header cells POS, DRIVER, TIME and GAP and one row per car, in finishing order. Each row shows its position, a driver label ('YOU · #1' for car 0, 'CPU · #n' for a bot, where n is that car's livery number, e.g. 'CPU · #7') and the time `formatTime` gives for its finishTick (7200 ticks → '2:00.00').
- **AC3**: GAP reads '–' (en dash) for the leader. Every other finished car shows its time minus the leader's as '+s.cc', or '+m:ss.cc' at 60 s or more. Example: leader finishTick 7200 and the next car 7237 gives '+0.62'; a car 4200 ticks behind gives '+1:10.00'.
- **AC4**: A car that hasn't finished when the screen opens is listed after the finished cars, with TIME and GAP both '–:––.––'. A later sync where it has finished fills in its time and gap. Syncs where nothing changed make no DOM mutations under the results screen.
- **AC5**: Exactly one row (the player's) has the modifier class `ui-results__row--player`. Row i (0-based, in table order) has the inline custom property `--ui-deal-index: i`, which the CSS multiplies by the 40 ms stagger token.
- **AC6**: The placing roundel shows the player's position as an ordinal: '1ST' when the player wins, '2ND' when the player finishes behind the bot. A new exported `ordinal(n)` in `src/ui/format.ts` returns 1→'1ST', 2→'2ND', 3→'3RD', 4→'4TH', 11→'11TH', 12→'12TH', 13→'13TH', 21→'21ST', 22→'22ND'.
- **AC7**: The results screen has a RETRY button that calls `onRaceAgain` and a NEXT RACE button that calls a new `onNextRace` option, each exactly once per click. NEXT RACE has focus when the screen opens. After reset() and a second finish, the table holds only the new race's rows (one per car). No inline style or SVG paint attribute sets a colour.
- **AC8**: `nextTrackId(currentId, ids?)` exported from `src/content/tracks.ts` returns the id after `currentId` in `ids` (default: registered TRACKS order) and wraps from the last back to the first. ['a','b','c']: 'a'→'b', 'c'→'a'. With the real registry, 'dust-bowl'→'dust-bowl'. An unknown id throws.
