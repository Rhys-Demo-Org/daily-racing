# UI Rules (from Claude Design, v1)

> Source of truth for all 2D UI and the 3D look. Exported from the Claude Design file `source/Daily_AI_Racer_UI_Look.html`. Section 9 defines the camera.


Every UI element is a painted tin toy part: flat fill + ink outline + solid ink offset shadow. When unsure, copy an existing component exactly.
## 1 · COLOUR

Use only these 10 values, by token name: cream #F2E6C9, dirt #C08A4F, dark-dirt #8A5A32, grass #6E8B3D, deep-green #3F5A2A, teal #3E8A8C, rally-red #D64933, mustard #E3A72F, navy #24324A, ink #1B1A1F.

Never: new hex values, alpha/rgba, opacity < 1, blend modes, CSS filters, blur, gradients. The only patterns allowed are hard-stop stripes and chequers built from two palette colours.

Need darker? Step down the shade ladder: cream→dirt, mustard→dirt, dirt→dark-dirt, rally-red→dark-dirt, grass→deep-green, teal→deep-green, dark-dirt→ink, navy→ink.

Roles: rally-red = primary action, danger, the player. mustard = highlight, pickups, 1st, selection, focus. grass = go / positive. teal = info. navy = dark panels. ink = outlines, shadows, text.

## 2 · TEXT ON COLOUR

Any size: ink on cream / mustard / dirt; cream on navy / ink / deep-green / dark-dirt; mustard on navy / ink.

24px+ and weight 800+ only: cream on rally-red or teal; ink on grass, teal or rally-red.

Never: cream on dirt or mustard. Never put text straight on the 3D scene: it always sits on a panel.

## 3 · SHAPE, OUTLINE, SHADOW

Radius: 4px on all rectangles; 50% only for roundels and round thumb buttons; 0 for stripes and bands. No other values.

Outline: solid ink. 2px if the element is under 32px, 3px default, 4px if over 120px or on desktop.

Shadow: Npx Npx 0 ink, zero blur, down-right. 3px HUD, 4px buttons/panels, 6px big overlays (countdown, pause card). Text never gets a shadow.

Pressed: the element sinks toward its shadow by the offset minus 1px and the shadow shrinks to 1px (4px shadow → move 3px; 3px → move 2px). Fill one rung down the ladder, or mustard for touch controls. Never fully flat.

## 4 · TYPE

Display: Barlow Condensed 800 / 900, uppercase. Italic 900 for headings and calls (GO!, RACE, PAUSED). Upright 800 for numbers and labels.

Text: Atkinson Hyperlegible 400 / 700, sentence case, for prose under 16px only.

Numbers: every value that changes uses font-variant-numeric: tabular-nums. Times are m:ss.cc. Position is "2/6", with the "2" in mustard at hud-xl.

Scale (mobile/desktop): countdown 160/280, display 56/96, hud-xl 44/64, title 32/48, hud-l 28/40, button 22/28, label 13/16 (+0.12em tracking, caps), body 14/16. Minimum 13px anywhere.

Self-host the woff2 files; font-display: block.

## 5 · LAYOUT & SAFE AREAS

Reference frame: 844×390 landscape. Insets: left/right max(48px, env(safe-area-inset-*)), top 12px, bottom max(21px, env(safe-area-inset-bottom)).

Spacing: 4, 8, 12, 16, 24, 32, 48 only. 8px between HUD widgets in a stack.

Centre clear zone: the middle 50% of width and 60% of height never holds HUD (countdown and pause excepted).

Corners own content: top-left = race status (position, lap, map). Top-right = time, best, pause. Bottom-left = steering. Bottom-right = gas, brake, action. New HUD items join one of these stacks; nothing floats free.

Desktop: same layout at ×1.45, 32px margins, 4px outlines. No touch controls; show a keycap legend bottom-left for the first lap.

## 6 · TOUCH CONTROLS

Steer: two 84×80 pads bottom-left, 8px apart. Gas ⌀100 bottom-right corner; brake/reverse ⌀72 to its left; action ⌀64 above gas. Drawn shape ≥ 48px; hit area +12px each side; multi-touch.

States: active (cream / red / navy fills + shadow) for 4s after race start or resume → resting (hollow: no fill, ink ring, ink glyph, no shadow). Any press reactivates that control. Pressed = mustard. Never use opacity to hide.

## 7 · MOTION & OVERLAYS

Every state change moves a little, along its own shadow (live demos: board 05 Motion). Animate only transform, box-shadow offset, clip-path and visibility; colours always cut.

Timing: press 60 · release 120 · stamp 160 · slide 200 · wipe 250 · stagger 40ms. Easings: snap (.2,.9,.3,1); stamp (.3,1.5,.5,1), one overshoot, landings only; sweep (.6,0,.4,1) for wipes.

Per step: buttons press-sink and hover-lift 1px; touch controls wake with a 0.9→1 pop and rest by retracting the shadow; position digit rolls and its panel bumps; lap panel stamps; new-best chip slides out; countdown roundels drop onto the table; pause hatch wipes in, card drops; result rows are dealt 40ms apart, then the placing roundel stamps; cards lift 2px on hover, locked cards shake; HUD panels slide in from their own edge; pickups pop the action button.

Dimming the scene: overlay a hatch of 3px ink lines every 9px at 45° (hard-stop pattern) — never a translucent layer. Full-screen menus use a solid navy or cream ground.

Screen change: the triple stripe sweeps left→right in 250ms (stripes 40ms apart); the new screen cuts in under the red stripe. The chequer band is used when entering a race.

Never: fades, blur, glow, colour tweens, idle pulsing, animating the race timer or focus ring. Reduced motion: keep the press sink, cut everything else.

## 8 · THE 3D WORLD MUST MATCH

Vertex colours use the same 10 values. Top faces take the base colour; side faces one rung down the ladder. Ink outlines on every mesh (inverted-hull, ~2px at 844 wide). Shadows are flat ink blobs under objects, no soft shadow maps.

Player car is always rally-red with a cream stripe and a red ▼ marker. AI cars: mustard, teal, cream, navy, grass — never red. Every car: boxy body, navy cabin, cream roof roundel, ink wheels.

Props: hay bales (mustard/dirt), tyre stacks (ink/navy), cone trees (grass/deep-green), ramps (dark-dirt with red/cream chevrons), chequered start band.

## 9 · CAMERA — TILTED THREE-QUARTER DIORAMA VIEW

Angle: one fixed perspective camera looking down at 57° from horizontal (allowed 55–60°), facing north. It never yaws, rolls, orbits or shakes: north is always screen-up. It follows the race by translation only, smoothed, aiming slightly ahead of the player.

Lens: narrow field of view, about 19° vertical, placed far back (≈80 units from its target) so it reads as a tabletop diorama. Things at the top of the frame are only slightly smaller (≈10–15%) than at the bottom; never fisheye, never orthographic-flat.

Framing: about 56 world units across the screen at the target on mobile, 55 on desktop. A car (4.2 long) is ≈ 60px long at 844 wide. Track 8.4 wide. Never zoom for drama.

What you see: roofs and tops, plus the south face and the east or west face of each object. Never undersides. Cones on trunks show the trunk below the canopy; tyre stacks are cylinders; bales are boxes; ramps are wedges showing slope and side.

Light & shading: one directional light from screen top-left (direction to light ≈ west −0.55, south −0.25, up 0.8). Flat-shaded faces, toon ramp of 3 hard steps on the shade ladder: N·L ≥ 0.7 base colour, 0.1–0.7 one rung down, below 0.1 two rungs down. No smooth normals, no specular, no ambient occlusion.

Shadows & outlines: flat ink blob shadows on the ground, offset east/north-east, hard edged. Inverted-hull ink outlines on every mesh (≈2px at 844 wide) plus crease lines between faces. Concept frames A (mobile) and B (desktop) are the reference.

## 10 · BUILDING ANY NEW UI ELEMENT — IN THIS ORDER
Classify it: panel, button, HUD widget, chip/badge, or touch control. Start from that existing component.
Fill by role (section 1). Text colour from the pairing list (section 2).
Outline by size (2/3/4px ink). Radius 4px, or circle if it is a roundel or round button.
Shadow by tier (3/4/6px). Pressed = sink onto a 1px shadow; give it its move from board 05.
Type from the scale tokens only. Numbers tabular. Labels caps 13px.
Size: touchable ≥ 48px; spacing from the 4-base scale.
Place it in a corner stack or a menu column; keep the centre clear.
Define states: default, pressed, focus (4px mustard ring, 4px offset; cream ring if the element is mustard), disabled (dark-dirt, no shadow), resting if it overlays play.
Check it over both dirt and grass. If it vanishes, put it on a navy panel.
Motion from section 7 only. If a rule here doesn't cover it, ask for a design update — don't invent.
## 11 · BANNED

Glassmorphism / frosted panels · neon glow · purple or blue gradients · any gradient · soft rounded cards · blurred drop shadows · opacity tricks · system, Inter or Roboto fonts · sparkle or "magic" icons · thin-line icon sets · emoji · esports styling (angular HUD brackets, scanlines, hex grids) · photos and textures · text on the raw 3D scene.