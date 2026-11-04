# B05 · Desktop HUD and keycap legend: builder notes

- **Desktop breakpoint (owner please confirm):** fine pointer and viewport ≥ 1224×566, which is the
  844×390 reference frame (`tokens.safeArea.frame`) × `tokens.desktop.scale` (1.45), rounded up.
  It is computed in one place, `src/ui/layout.ts` (`DESKTOP_MIN`, `DESKTOP_QUERY`). A breakpoint
  token would let B08 and the countdown/pause desktop sizes share it.
- Desktop styling is CSS under `.ui-hud.is-desktop`. The minimap viewBox and the createHud and
  createRaceUi signatures are unchanged.
- Touch controls keep their reveal-on-first-touch behaviour (plan audit); only the coarse-pointer
  query moved to `layout.ts`.
- Choices inside the rules: keycaps use the HUD tier (3px outline, 3px shadow, 36px key), matching
  the mockup; the legend panel has a 4px desktop outline and a 4px panel shadow, and slides in from
  the left (§7, "HUD panels slide in from their own edge"). HUD shadows stay at the 3px HUD tier on
  desktop, because §5 scales only sizes, margins and outlines.
