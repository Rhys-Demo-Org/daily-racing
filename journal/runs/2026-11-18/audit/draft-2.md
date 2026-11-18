# B11 · Track: Pine Ridge and the lock rule

Date: 2026-11-18 · mode: backlog · backlog: B11

## Summary

Add Pine Ridge as track JSON (id forest-ridge, 3 laps, width 11): sharp, angular, two ramps, dense cone trees. The lock rule is exported data in src/content/tracks.ts; src/sim/track.ts is untouched. A player finish is saved under racer.finished.<id> at once, and the lock is re-read each menu show. The locked card follows S6: dark dirt with shadow, ink-only track line, padlock roundel, empty best. It shakes on tap (transform, motion tokens, none under reduced motion). NEXT RACE skips locked tracks. The card sits third, not last as in S6, because append-only track-select tests need the last card selectable (say so in the PR). Four cards fit by narrowing and wrapping names, with no new sizes, or a design request is filed.

## Acceptance criteria

- **AC1**: Exported track data: getTrack('forest-ridge') is named "Pine Ridge" with 3 laps and width ≥ 11, and passes validateTrack. TRACKS order is bends, dust-bowl, forest-ridge, hay-loop. The exported lock data says forest-ridge unlocks after a finish on hay-loop, and no other track is locked.
- **AC2**: Pine Ridge's layout has exactly 2 ramps and at least 4 sharp corners, each turning ≥ 60° within 30 units of lap distance and at least 40 units apart. Centreline samples more than 60 units apart along the lap are always at least width + 2 apart, so the road never overlaps itself.
- **AC3**: Pine Ridge's layout has at least 60 cone trees, more than any other registered track, with trees on both sides of the road. No prop stands closer to the centreline than half the width + 1.
- **AC4**: On Pine Ridge with seeds 1–3, a six-car race driven only by bots (car 0 included) ends with all six cars finishing 3 laps within 10800 ticks.
- **AC5**: In the game's menu with empty storage, the Pine Ridge radio has aria-disabled="true" and a padlock named "Locked". It reads "BEST –:––.––" even when racer.bestLap.forest-ridge is stored. Clicking it leaves Bramble Bends selected. From Dust Bowl, ArrowRight selects Hay Loop and ArrowLeft returns to Dust Bowl. RACE starts the selected track.
- **AC6**: When car 0 finishes a race on Hay Loop, racer.finished.hay-loop is in localStorage while the results screen shows, before any return to the menu. Finishing on Dust Bowl writes nothing that unlocks Pine Ridge, and its card stays locked on the next menu show.
- **AC7**: After a Hay Loop finish, the next menu show (by NEXT RACE, then PAUSE → QUIT TO MENU, or by the game's showMenu) re-reads the lock. The Pine Ridge radio is not aria-disabled, has no padlock, shows its stored best and can be selected. RACE then starts forest-ridge. A new game created on the same storage also shows it unlocked.
- **AC8**: NEXT RACE on the results screen: from Dust Bowl it starts Hay Loop while Pine Ridge is locked, and Pine Ridge once racer.finished.hay-loop is stored. From Pine Ridge it starts Hay Loop.
- **AC9**: With localStorage getItem and setItem both throwing, the player can finish a race on Hay Loop and return to the menu without any error. The menu renders all four cards, with Pine Ridge still locked.
- **AC10**: The screen stages include 'start--menu-unlocked', where the Pine Ridge card is enabled with no padlock; in the existing 'start--menu' stage it is locked. In Chromium at 844×390, in 'start--menu', all four cards and RACE are inside the viewport, no card overlaps RACE, and no card's name or best text is clipped (scrollWidth ≤ clientWidth).

## What you'll see

The track select now has a fourth card, Pine Ridge, third in the row. It starts locked: a dark brown card with the track drawn as a plain dark line and a padlock badge, and it shakes when tapped. Once you finish a race on Hay Loop it unlocks: a sharp, angular track through dense pine trees with two jumps.

## How to play-test

1. Open the preview in a private or incognito tab on your phone so no saved progress carries over.
2. On the title screen, check that the third card, Pine Ridge, is dark brown with a padlock and reads BEST –:––.––, and that all four cards and RACE fit on screen.
3. Tap Pine Ridge: it should shake and stay unselected, and RACE should still start the track that was already picked.
4. Select Hay Loop, tap RACE and finish the race.
5. On the results screen tap NEXT RACE, then tap PAUSE and QUIT TO MENU (or just reload the page). Pine Ridge should now look like the other cards, with no padlock.
6. Select Pine Ridge and tap RACE: you should drive a sharp, angular track through dense pine trees with two ramps.
7. Reload the page: Pine Ridge should stay unlocked.

## Expected files

- `src/content/tracks/forest-ridge.json`
- `src/content/tracks.ts`
- `src/ui/best-laps.ts`
- `src/ui/race-ui.ts`
- `src/ui/start-screen.ts`
- `src/ui/track-card.ts`
- `src/ui/title.css`
- `src/ui/icons.ts`
- `src/ui/types.ts`
- `src/game.ts`
- `src/ui/stages/start.stage.ts`
- `tests/content/pine-ridge.test.ts`
- `tests/content/pine-ridge-bot.test.ts`
- `tests/ui/pine-ridge-lock.test.ts`
- `tests/game/pine-ridge-unlock.test.ts`
- `tests/game/pine-ridge-next-race.test.ts`
- `tests/ui/pine-ridge-stage.test.ts`
- `tests/ui/track-select-fit-phone.test.ts`
