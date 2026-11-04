## B05 · Desktop HUD and keycap legend
depends_on: none
scope: On desktop (no touch, viewport ≥ the desktop breakpoint) the HUD uses the desktop type
sizes and ×1.45 scale, 32 px margins and 4 px outlines; touch controls are hidden. A keycap
legend panel sits bottom-left for the first lap only, listing the bindings that exist today
(← → steer, ↑ gas, ↓ brake, Esc pause if B01 is merged). Keycaps use SVG arrow icons, not glyphs.
Mockup: `mockups/desktop-race-hud-1440x900.png`.
done_when: at 1440×900 with a mouse-only device the HUD uses desktop tokens and no touch controls
render; the legend shows during lap 1 and is gone from lap 2.
