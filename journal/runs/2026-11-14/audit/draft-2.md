# B09 · HUD event motion

Date: 2026-11-14 · mode: backlog · backlog: B09

## Summary

The race HUD moves on events (UI_RULES §7, board 05 #3/#9), using only transform, box-shadow, clip-path and visibility with motion tokens. A position change bumps the Pos panel to ×1.12 (stamp, 160 ms) and rolls its digit one digit height in a clipped box (snap, 120 ms; board's 42 px written as 100%). A new lap stamps the Lap panel from scale 1.18 (board 05) to 1. A race reset slides HUD panels and touch slots in from their own edge (slide 200 ms, snap, 40 ms stagger); the entry ends at GO, so a resume never replays it. The existing wake pop and retraction stay as they are. Under reduced motion only the press sink stays. Out of scope: the Pos gain/loss colour cut (later item) and the keycap legend (slide unchanged). Once B08 lands, the entry may need to wait for its wipe.

## Acceptance criteria

- **AC1**: In Chromium at 844×390, a stage where the race UI is reset, synced racing at P3, then synced a tick later at P2 shows Pos digit 2. The panel holding the label Pos computes an animation (animation-name not none) of 0.16s with timing cubic-bezier(0.3, 1.5, 0.5, 1). The element showing the digit computes one of 0.12s with cubic-bezier(0.2, 0.9, 0.3, 1).
- **AC2**: In Chromium, a stage where the race UI is reset and its first sync is already racing at P2 on lap 2/3 (no change since that sync) shows the Pos panel, its digit and the Lap panel computing animation-name none. So does a stage with two racing syncs at the same position and lap.
- **AC3**: In Chromium, a stage that syncs racing on lap 1 and then a tick later on lap 2 shows the panel labelled Lap reading 2/3. That panel computes an animation (animation-name not none) of 0.16s with timing cubic-bezier(0.3, 1.5, 0.5, 1).
- **AC4**: In Chromium, stages that repeat the AC1 overtake and the AC3 new lap, then sync once more 10 race ticks later (ceil(160×60/1000)) at the same position and lap, show the Pos panel, its digit and the Lap panel computing animation-name none, i.e. no longer animating.
- **AC5**: In Chromium, a stage just after a race reset (countdown) has, in order, Pos, Lap, Track map, Time (Best rides with it), Pause, then the touch controls Steer left, Steer right, Brake or reverse, Accelerate computing a 0.2s cubic-bezier(0.2, 0.9, 0.3, 1) animation (on the element or a wrapper in its layer), delays 0s, 0.04s … 0.32s.
- **AC6**: In Chromium, a stage that resets, counts down, syncs racing at raceTick 600, then pauses and resumes shows none of the AC5 HUD panels computing an animation (animation-name none on the element and its wrappers in the HUD). A resume does not replay the entry.
- **AC7**: In Chromium with reducedMotion 'reduce', the AC1, AC3 and AC5 stages first show their event state: Pos digit 2, Lap reading 2/3, the countdown under way. Even so, the Pos panel, its digit, the Lap panel and every AC5 entering element (and wrappers) compute animation-name none. In the AC1 stage, with Accelerate held, that button computes a non-identity transform (the press sink).

## What you'll see

When a race starts, the top-corner HUD panels slide down into place and the steering, brake and gas controls slide up from the bottom, one after another. During the race the position box bumps and its number rolls whenever you pass a car or get passed, and the lap box stamps down when a new lap starts.

## How to play-test

1. Open the preview on your phone in landscape and tap RACE.
2. As the countdown begins, watch the position, lap, map, time and pause panels slide down from the top, then the steering, brake and gas controls slide up from the bottom, one after another.
3. Pause and resume: the panels should stay put rather than slide in again.
4. Overtake a car or let one pass you, and watch the position box bump while its number rolls.
5. Cross the start line to finish lap 1, and check the lap box stamps down as it changes to 2/3.
6. Optional: turn on Reduce Motion in your phone's accessibility settings and start a race. Nothing should slide, bump or stamp, but a pressed control should still sink.

## Expected files

- `src/ui/hud.ts`
- `src/ui/hud.css`
- `src/ui/race-ui.ts`
- `src/ui/touch-controls.ts`
- `src/ui/touch-controls.css`
- `src/ui/stages/hud-motion.stage.ts`
- `src/ui/stages/stage.ts`
- `tests/ui/hud-motion-events.test.ts`
- `tests/ui/hud-motion-entry.test.ts`
- `tests/ui/hud-motion-reduced.test.ts`
