# B05 · Desktop HUD and keycap legend

Date: 2026-11-04 · mode: backlog · backlog: B05

## Summary

On a desktop (no coarse pointer, and a viewport at least the 844×390 reference frame ×1.45, i.e. 1224×566, worked out from tokens rather than written as literals), the race HUD switches to desktop layout. It uses the desktop type tokens (hud-xl 64, hud-l 40, label 16), 32 px margins instead of the phone insets, 4 px ink outlines, and the minimap and PAUSE button at ×1.45. The phone layout is unchanged, and the mode updates live on resize. A navy keycap-legend panel sits bottom-left for the player's first lap only. It reads ← → STEER, ↑ GAS, ↓ BRAKE, ESC PAUSE, with SVG arrow icons on keycaps (↑ on rally-red, as in the mockup) and no SPACE/POWER-UP, because that binding doesn't exist yet. The countdown, pause and results screens stay as they are tonight.

## Acceptance criteria

- **AC1**: Browser test (HUD mid-race stage): at 1440×900 without touch, the POS digit is 64px, the LAP value 40px, HUD labels 16px, and the POS, LAP and TIME panels have 4px outlines. The POS panel sits 32px from the viewport's left and top, PAUSE's right edge 32px from the right, and no touch control is visible. At 844×390 with touch, the stage keeps POS 44px and 3px outlines.
- **AC2**: Browser test: a 1440×900 non-touch page showing the HUD stage switches to the phone sizes (POS digit 44px, 3px outlines) after it is resized to 1000×700. Resized back to 1440×900, it returns to POS 64px.
- **AC3**: On a desktop (fine pointer only, 1440×900 viewport), after the race UI is reset and synced with the player on lap 1 (countdown or racing), a visible group named "Keyboard controls" exists. Its labels read STEER, GAS, BRAKE, PAUSE in that order, and the text SPACE or POWER-UP appears nowhere in it.
- **AC4**: In the "Keyboard controls" legend, the steer, gas and brake keycaps (four in total) each contain an SVG icon, and the legend's text has none of the characters ← → ↑ ↓. The pause keycap reads ESC.
- **AC5**: Once a sync shows the player has completed lap 1 (lapsCompleted ≥ 1, so lap 2 or finished), the "Keyboard controls" legend is no longer visible. It stays hidden on later syncs and is visible again after the next reset and lap-1 sync.
- **AC6**: On a coarse-pointer (touch) device, or on a viewport below 1224×566, the "Keyboard controls" legend is never visible, even during lap 1. A new screen stage shows the desktop HUD on lap 1 with the legend, and it is listed by the stage registry.

## What you'll see

On a computer, the race HUD is bigger (larger numbers, thicker outlines, 32 px from the screen edges), and the phone's on-screen buttons don't show. A dark panel in the bottom-left corner shows keyboard keys: left/right arrows STEER, up GAS, down BRAKE, ESC PAUSE. It goes away when you start lap 2. On a phone nothing changes.

## How to play-test

1. Open the preview on a laptop or desktop browser with the window maximised (at least about 1250×600).
2. Press RACE. During the countdown and lap 1, check the bottom-left panel lists the keys with drawn arrow keycaps and that there are no on-screen touch buttons.
3. Drive across the line to start lap 2 and check the key panel disappears and stays gone.
4. Make the browser window small (narrower than about 1200 px) and check the HUD shrinks back to phone size.
5. Open the preview on your phone in landscape: the HUD and touch controls look exactly as before and there is no key panel.

## Expected files

- `src/ui/layout.ts`
- `src/ui/keycap-legend.ts`
- `src/ui/keycap-legend.css`
- `src/ui/race-ui.ts`
- `src/ui/hud.ts`
- `src/ui/hud.css`
- `src/ui/components.css`
- `src/ui/icons.ts`
- `src/ui/touch-controls.ts`
- `src/ui/stages/hud.stage.ts`
- `tests/ui/desktop-hud.test.ts`
- `tests/ui/keycap-legend.test.ts`

## Plan audit

Verdict: **approve** (round 1)

The draft covers B05's scope and done_when using only tokens, UI_RULES §5 and the desktop mockup. Its criteria are observable through the DOM, stages and RaceView, and nothing needs retiring. The only open PR (#23, countdown framing) touches none of the expected files, so I see no blocker or major problem.

- minor · design: UI_RULES has no numeric desktop breakpoint. The draft picks 1224×566, the 844×390 reference frame ×1.45, derived from the tokens' desktop.scale. That is a reasonable reading of 'same layout at ×1.45', but it is still the draft's own choice. Fix: Builder: compute the threshold from the tokens (reference frame × tokens.desktop.scale) in one place, with no literals. Mention the chosen threshold in the PR body so the owner can confirm it or add a breakpoint token.
- minor · testability: Parts of AC1 ('no touch control is visible' on a fine pointer) and AC6 ('legend never visible on touch/small viewport') already pass on main, because touch-controls.ts hides itself unless the pointer is coarse and the legend doesn't exist yet. The combined criteria still fail on main because of the 64px/4px/32px checks and the new stage. Fix: Builder: make sure each AC test also asserts the part that is new tonight. For AC6, first show the legend in the desktop context at lap 1, then show it absent in the touch and small-viewport contexts, so the test can't pass vacuously.
- minor · scope: tests/ui/hud.test.ts pins the minimap to a 98×66 map, and existing HUD tests call createHud and createRaceUi as they are now. If the ×1.45 desktop scale is applied by changing the minimap's SVG coordinates or the HUD API rather than through CSS, existing append-only tests would break. Fix: Builder: apply the desktop scale and sizes in CSS (a desktop class or a media query driven by the tokens' CSS variables) and leave the minimap viewBox and the createHud/createRaceUi signatures unchanged.
- minor · design: The rules don't cover a touch laptop with a fine pointer at ≥1224 wide, where touch controls appear after the first touch. Desktop sizing plus touch controls would both show. Fix: Builder: keep the touch-controls reveal behaviour as it is and decide desktop mode by pointer and viewport only, as the draft says. Don't invent extra rules for this case.

Overlap with open PRs: The only in-flight diff (/inputs/pr-23.diff, countdown framing) changes src/game.ts, src/render/camera.ts, src/render/index.ts, src/render/scene.ts and src/ui/countdown.ts, plus new tests. None of these is among the draft's expected files. The draft leaves the countdown unchanged and doesn't change game.ts, so there is no shared behaviour or shared lines, and it doesn't depend on #23.

Backlog change requests for the owner:

- B05's scope says 'viewport ≥ the desktop breakpoint', but UI_RULES.md and tokens.json define no breakpoint (only desktop.frame 1440×900 and scale 1.45). Consider adding a desktop breakpoint token so later items (B08 title screen, countdown/pause desktop sizes) share one value.
