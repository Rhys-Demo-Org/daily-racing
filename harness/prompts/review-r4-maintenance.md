## Your focus: R4, what the screen gate can't see (maintenance)
Gate P1 compares every screen stage's DOM and computed styles with `main`, but only the static,
settled stage at its two viewports. For **every CSS or DOM hunk** in the diff, check what P1 misses:
- **State rules:** `:active`, `:hover`, `:focus-visible`, `:disabled`, `[aria-*]` and `.is-*` /
  `data-state` classes the code toggles at runtime. A moved, merged or deleted rule must still apply
  to the same elements in the same states with the same values.
- **Timing:** transitions, animations and keyframes (durations, delays, easing, which properties),
  and any JS timers that drive classes.
- **Other viewports and media queries:** widths, heights, orientation, `prefers-reduced-motion`,
  pointer or hover queries; a rule that moved into or out of an `@media` block.
- **Cascade and source order:** when declarations move between files or within one, check which
  rule now wins for each selector: specificity, `!important`, and the import order of the CSS
  files in every entry (`src/main.ts` for the game, `harness/screens/stages.ts` for the stages P1 sees,
  and every module they import, in order). A later rule that used to be overridden and now wins
  is a finding.
- Tokens only: no literals for colours, fonts or sizes (`guardrails/design/UI_RULES.md`).
Name the selector, the state or viewport, and the value before and after in each finding.
Record in `checked` every CSS/DOM hunk you traced and how, findings or not.
