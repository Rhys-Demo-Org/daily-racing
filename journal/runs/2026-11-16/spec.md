# B12 · Pickups and the action button

Date: 2026-11-16 · mode: backlog · backlog: B12

## Summary

Track JSON gets an optional `pickups` list ({at, lateral}). Only Dust Bowl uses it: two rows of three mustard boxes on its straights, clear of the ramp run-out. If the player drives through a box while not armed, the box vanishes for 300 ticks and the player is armed. Firing with CarInput `action` (replay flag bit 2; Space or the ⌀64 lightning button above GAS) gives a 90-tick boost to a top speed of 32. AI cars never collect or fire. RaceView gets optional pickup and boost fields, present only on pickup tracks. The action button and the desktop SPACE · POWER-UP keycap appear only then, so tracks without pickups, replays, bot laps and current HUD tests are unchanged.

## Acceptance criteria

- **AC1**: Track data takes an optional `pickups: {at, lateral}[]`. validateTrack accepts it and rejects `at` outside [0, 1) or |lateral| > width/2 − 1, naming the field. A track without the key validates to a copy without it. trackLayout(track).pickups gives one world {x, z} per pickup (empty without any). Dust Bowl declares ≥ 2 pickups; Bramble Bends and Hay Loop declare none.
- **AC2**: On Dust Bowl, raceView racers[0] has `armed: false` and `boostTicks: 0`, and RaceView has `pickups` (one boolean per layout pickup, all true). After car 0's centre passes within 2.5 units of a pickup, armed is true and that entry is false. AI cars that drive through boxes leave them present and their racer views always show armed false.
- **AC3**: Respawn: a collected pickup's `pickups` entry stays false for exactly 300 ticks, then is true again. An armed player who drives through another present box leaves it present (no stacking). Collecting alone never changes any car view compared with the same inputs on a copy of the track without pickups.
- **AC4**: Boost: car 0 at full throttle on a Dust Bowl straight at 25 units/s, armed, gets one tick with `action: true`. armed turns false and boostTicks becomes 90, then counts down 1 per tick to 0. Speed goes above 25 during the boost and never above 32. Within 120 ticks after the boost ends it is at most 25.5. `action: true` while not armed changes nothing compared with the same run without it.
- **AC5**: Tracks without pickups behave exactly as before: on Bramble Bends, running with `action: true` every tick gives car views and race views identical to the run without it. Those RaceViews have no `pickups` key and racer views have no `armed` or `boostTicks` keys.
- **AC6**: Replays: `action: true` is stored as flag bit 2. encode→decode gives `action: true` back, and runReplay of a recorded Dust Bowl run with one fired boost reproduces the live run's final car views exactly. Decoded frames with bit 2 clear have no `action` key.
- **AC7**: Input: Space sets `action: true` in the combined input's read() (it calls preventDefault). A Space press released before the next read still gives one read with `action: true`. A press on the action touch zone also counts. When neither is pressed, read() has no `action` key.
- **AC8**: In the race UI, after syncing a RaceView whose player racer has an `armed` field, the touch layer gains a button named "Boost" with the lightning icon, sitting above GAS. It is aria-disabled="true" while not armed and enabled while armed. It is marked popping on the sync where armed turns true. With no `armed` field there is no Boost button and there are 4 touch zones.
- **AC9**: On desktop, a race UI synced with a pickup RaceView shows the legend STEER, GAS, BRAKE, POWER-UP, PAUSE, with a SPACE keycap for POWER-UP. Without pickups it stays as it is. A registered stage renders the armed Boost button. On Dust Bowl the race scene has a 'pickups' group with one mesh per layout pickup, and a mesh hides while its `pickups` entry is false.

## What you'll see

Dust Bowl now has mustard boxes on its straights. Drive through one and it vanishes, and the round lightning button above GAS turns mustard with a little pop. Tap it (or press Space on a computer) and the car surges ahead for a moment. Five seconds later the box is back. Bramble Bends and Hay Loop look and drive exactly as before, with no lightning button.

## How to play-test

1. Open the preview on your phone in landscape and tap RACE. That starts Bramble Bends: check there's no lightning button above GAS.
2. Finish the race and tap NEXT RACE to go to Dust Bowl.
3. After GO, check a dirt-coloured round lightning button sits above GAS, and mustard boxes are on the straights.
4. Drive through a box: it disappears and the lightning button turns mustard with a quick pop.
5. Tap the lightning button while holding GAS on a straight: the car should visibly speed up for about a second and a half, then settle back.
6. Drive past the same spot about five seconds later: the box is back.
7. On a computer at full screen, start Dust Bowl the same way. The bottom-left key legend should show a SPACE · POWER-UP key, and pressing Space after collecting a box gives the boost.

## Expected files

- `src/sim/types.ts`
- `src/sim/track.ts`
- `src/sim/world.ts`
- `src/sim/car.ts`
- `src/sim/pickups.ts`
- `src/sim/replay.ts`
- `src/content/tracks/dust-bowl.json`
- `src/input/keyboard.ts`
- `src/input/touch.ts`
- `src/input/index.ts`
- `src/ui/touch-controls.ts`
- `src/ui/touch-controls.css`
- `src/ui/touch-state.ts`
- `src/ui/icons.ts`
- `src/ui/keycap-legend.ts`
- `src/ui/keycap-legend.css`
- `src/ui/race-ui.ts`
- `src/ui/stages/pickups.stage.ts`
- `src/game.ts`
- `src/render/scene.ts`
- `src/render/props.ts`
- `tests/sim/pickups.test.ts`
- `tests/sim/boost.test.ts`
- `tests/sim/pickup-replay.test.ts`
- `tests/input/action-input.test.ts`
- `tests/ui/action-button.test.ts`
- `tests/render/pickups-scene.test.ts`

## Plan audit

Verdict: **approve** (round 1)

The draft covers B12's scope and done_when and nothing more. It is opt-in per track (Dust Bowl only), keeps bot laps and replays unchanged (AI never collects, and collecting alone never changes car state), and follows UI_RULES §6 and the mockups for the ⌀64 action button above GAS and the SPACE · POWER-UP keycap. Each criterion tests one observable behaviour through a public seam. The remaining issues are minor and go to the builder.

- minor · design: The draft never says what a pickup box looks like. A plain mustard box shaded per §8 (top mustard, sides dirt) looks just like a hay bale (render/props.ts: mustard box, 1.2 tall, the size of the sim's collider). Hay bales are obstacles, so a player could steer around pickups thinking they are bales. Fix: Builder: build the pickup only from what §8 already allows: palette-index mustard top, dirt sides, ink inverted-hull outline, flat ink blob shadow. Make it a single cube clearly smaller than a bale (about 1 unit) and place it alone on the dirt ribbon, never in a row beside the track, so where it sits is what tells it apart. No new colours, glow, spin or bob animation (§7 bans idle pulsing).
- minor · design: The action button's states need pinning. The S1–S2 mockup shows it unarmed as a dirt roundel with a dark-dirt lightning glyph, but §10's generic disabled state is dark-dirt with no shadow, and §6 uses mustard for pressed touch controls. Fix: Builder: unarmed follows the S1–S2 mockup (dirt fill, dark-dirt glyph, ink ring). Armed fill is mustard (§1: mustard = pickups) with an ink glyph. Keep the §6 resting/active behaviour shared with the other controls. Use the existing wake pop (0.9→1 scale, transform only, motion tokens) as the collect pop, cut under reduced motion. Colours cut, never tween.
- minor · testability: Existing tests/ui/touch-state.test.ts maps TOUCH_CONTROL_IDS and expects exactly 4 states, 4 .ui-tc buttons and 4 zones from a plain createTouchControls(). Adding 'action' to TOUCH_CONTROL_IDS, or always rendering the button, would break append-only tests. Fix: Builder: leave TOUCH_CONTROL_IDS and the default createTouchControls() output unchanged. Add the action button and its zone only when the race UI turns it on (a RaceView whose player racer has `armed`), as AC8 already says.
- minor · testability: AC4 says 'at 25 units/s', but dirt topSpeed is 25 and acceleration tapers as (1−u²), so the car only approaches 25 and never reaches it exactly. AC4 also needs about 3.5 s of mostly-dirt driving to watch the boost and the decay (overSpeedDrag 2.2 takes 32 down to about 25.1 within 120 ticks, so the 25.5 bound holds). Fix: Builder: write the AC4 test as 'speed ≥ 24 before firing', and steer car 0 with the bot's steer (throttle held) so it stays on dirt. Assert the max-speed bound of 32 on every tick of the boost.
- minor · testability: AC8's 'marked popping' doesn't say what can be observed. Fix: Builder: make the pop observable the way the existing wake pop is: a state class added on the sync where armed turns true and removed after the motion duration. Test that it appears on that sync and not on later syncs while armed stays true.
- minor · scope: src/ui/keycap-legend.ts's header comment says there is no power-up binding and so no SPACE key. That becomes stale. src/sim/replay.ts also describes bit2 as 'reserved'. Fix: Builder: update both comments to describe the new behaviour: SPACE · POWER-UP only on pickup tracks, and bit2 = action.
- minor · visible: Play-test step 2 needs a full 3-lap Bramble Bends race before Dust Bowl can be reached, because track select (B08, #30) isn't merged. That works but is slow on a phone. Fix: Keep the step, but mention in the run notes that the owner can retire from Bramble Bends faster by finishing quickly. Nothing in the spec changes.

Overlap with open PRs: The harness reports no file overlap. #30 (B08), #31 (B09) and #32 (maintenance) list zero files, and the only diff in /inputs is #29. #29 adds the hay-loop bot-lap baseline and a best-lap browser test. That test drives Dust Bowl with bot inputs. It never fires action, collecting changes no car state, and the action button sits bottom-right, away from the NEW BEST chip, so #29 still passes. B09 (#31) may change touch-controls and race-ui to slide touch slots in. B12 doesn't build on it. At worst both edit those files, a mechanical rebase, and the new action slot would need adding to B09's slide-in afterwards. That doesn't change either feature, so building tonight is safe.
