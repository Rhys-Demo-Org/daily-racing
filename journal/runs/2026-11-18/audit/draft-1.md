# B11 · Track: Pine Ridge and the lock rule

Date: 2026-11-18 · mode: backlog · backlog: B11

## Summary

Add "Pine Ridge" as pure track JSON (3 laps, width 11): a sharp, angular circuit like the S6 thumbnail, two ramps, and a dense cone-tree forest. Its file id is `forest-ridge`. Existing append-only tests require Bends first, Dust Bowl → Hay Loop, Hay Loop wrapping to Bends, and selectable cards in slots 1, 2 and last, so it sits third on the menu. Its card starts locked: dark-dirt, ink-only outline, cream padlock roundel, BEST –:––.––, not selectable, a sideways shake when tapped (board 05 #7). A player finish on Hay Loop is stored under `racer.finished.<trackId>` and unlocks it. NEXT RACE skips locked tracks. Direct startRace calls (driver/gates) ignore the lock.

## Acceptance criteria

- **AC1**: getTrack('forest-ridge') is named "Pine Ridge" with 3 laps and width ≥ 11, and passes validateTrack. Registry order is bends, dust-bowl, forest-ridge, hay-loop. nextTrackId with no id list skips tracks that have a lock rule: nextTrackId('dust-bowl') is 'hay-loop' and nextTrackId('forest-ridge') is 'hay-loop'.
- **AC2**: Pine Ridge's layout has exactly 2 ramps. It has at least 4 sharp corners, each turning ≥ 60° within 30 units of lap distance, at least 40 units apart. Centreline samples more than 60 units apart along the lap are always at least width + 2 apart (the ribbon never overlaps).
- **AC3**: Pine Ridge's layout has at least 60 cone trees, more than any other registered track, and trees on both sides of the road. No prop stands closer than half the width + 1 to the centreline.
- **AC4**: On Pine Ridge, seeds 1–3, a six-car race driven only by bots (car 0 included) ends with all six cars finishing 3 laps within 10800 ticks.
- **AC5**: In the game's menu with empty storage, the Pine Ridge radio has aria-disabled="true", a padlock with accessible name "Locked", and reads "BEST –:––.––" even if racer.bestLap.forest-ridge is stored. Clicking it leaves Bramble Bends selected. From Dust Bowl, ArrowRight selects Hay Loop and ArrowLeft goes back to Dust Bowl. RACE starts the selected track.
- **AC6**: After the player (car 0) finishes a race on Hay Loop and returns to the menu, racer.finished.hay-loop is in localStorage. The Pine Ridge card is no longer disabled, has no padlock, shows its stored best and can be selected, and RACE then starts 'forest-ridge'. A new game on the same storage also shows it unlocked.
- **AC7**: Finishing a race on Dust Bowl does not unlock Pine Ridge. While it is locked, NEXT RACE on Dust Bowl's results starts Hay Loop. Once racer.finished.hay-loop is stored, NEXT RACE on Dust Bowl's results starts Pine Ridge.
- **AC8**: With localStorage getItem and setItem both throwing, the player can finish a race on Hay Loop and return to the menu without any error. The menu renders all four cards, with Pine Ridge still locked.
- **AC9**: The screen stages include 'start--menu-unlocked', where the Pine Ridge card is enabled with no padlock. In the existing 'start--menu' stage it is locked.
- **AC10**: In Chromium at 844×390, in the 'start--menu' stage, all four track cards and RACE lie inside the viewport. No card overlaps RACE, and no card's name or best text is clipped (scrollWidth ≤ clientWidth).

## What you'll see

The track select now has a fourth card, Pine Ridge, between Dust Bowl and Hay Loop. It starts locked: a dark brown card with a padlock badge that gives a little sideways shake when tapped. After you finish a race on Hay Loop it unlocks into a sharp, angular forest track with two jumps.

## How to play-test

1. Open the preview in a private or incognito tab on your phone, so no saved progress carries over.
2. On the title screen, check that the third card, Pine Ridge, is dark brown with a padlock and reads BEST –:––.––.
3. Tap it: it should shake and stay unselected, and RACE should still start the track that was already picked.
4. Select Hay Loop, tap RACE and finish the race.
5. Quit to the menu: Pine Ridge should now look like the other cards, with no padlock.
6. Select it and tap RACE: you should drive a sharp, angular track through dense pine trees with two ramps.
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
- `tests/ui/pine-ridge-stage.test.ts`
- `tests/ui/track-select-fit-phone.test.ts`
