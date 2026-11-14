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

## Plan audit

Verdict: **approve** (round 2)

Approve. The draft covers B09's scope and done_when using only the motion values in UI_RULES §7 and board 05 #2, #3 and #9. Each criterion is a computed-style or DOM-text check on a new stage in Chromium, it retires no code, and no open PR touches its files. The remaining notes are minor and go to the builder.

- minor · design: Board 05 #3 says the lap panel stamps from 1.18 to 1 'with shadow 6→3px'. The draft only mentions the scale. Board 05 #9 also says the controls slide 'up' and the top panels 'down'. The draft says 'from their own edge', which is right, but AC5 doesn't check the direction. Fix: Builder: have the lap-stamp keyframes go from scale(1.18) with a 6px offset shadow to the normal 3px shadow, built from tokens (box-shadow offset is an allowed property). Slide the top-left and top-right panels down from above and the touch slots up from below, using translate in the keyframes.
- minor · overlap: Board 05 #9 says the HUD panels slide in 'after the wipe … before the countdown'. B08 (#30, in flight) adds a chequer band on entering a race, and its state changes happen at once under that overlay. Once #30 merges, an entry that starts at reset may play hidden under the band. Main has no wipe today, so building the entry at reset now is correct and visible. The draft already notes this. Fix: Builder: start the entry from reset() (or the first countdown sync) through one function, so that whichever of B08 and B09 merges second can delay it until the band clears without touching these tests. AC5 and AC6 only read stage state, so they stay valid either way.
- minor · testability: AC4 needs the bump, roll and stamp classes cleared in sim time (raceTick), not on animationend, or the frozen-time stage can't show animation-name none. A second position change while the bump class is still on must also restart the animation, and no criterion covers that. Fix: Builder: follow the NEW BEST chip pattern in race-ui.ts. Record the raceTick of the last position or lap change and clear the class ceil(duration×60/1000) ticks later. On a fresh change inside that window, re-apply the class so the animation restarts (for example by toggling a second keyframes name or forcing a reflow).
- minor · testability: AC7's 'animation-name none' checks would also pass on main, which has no HUD animations at all. The test fails on main only because the new stage doesn't exist yet. That is unavoidable for a 'motion is cut' criterion, but on its own it proves little. Fix: Builder: in the same reduced-motion test, check that the same stages under reducedMotion 'no-preference' do compute a non-none animation. That shows the media query is what removes it.
- minor · scope: The draft leaves the Pos gain/loss colour cut (grass/rally-red for 600 ms, board 05 #3) to a 'later item', but no item in the backlog covers it. B09's own scope doesn't list it either, so leaving it out is correct. Fix: No change to the draft. A backlog request has been raised so the colour cut isn't lost.

Overlap with open PRs: The harness reports no file overlap. The only diff in /inputs is pr-29.diff, which touches guardrails/manifest.json, tests/baselines/bot-laps.json and a new game test, none of them HUD files. B08 (#30) is in flight with no files listed. It is linked to this item only through board 05 #9's 'after the wipe' order, which is noted as a minor finding. Building the entry at reset is correct on main today.

Backlog change requests for the owner:

- Add a backlog item for the HUD Pos panel colour cut on a position change (board 05 #3: the fill cuts to grass on a gain or rally-red on a loss for 600 ms). Neither B09 nor any other item covers it.
- After B08 (#30) and B09 both merge, a follow-up should make the HUD entry slide (B09) start only once the B08 chequer band has cleared, per board 05 #9 ('after the wipe … before the countdown').
