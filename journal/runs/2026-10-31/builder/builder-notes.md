# B02 results screen: builder notes

- `tests/ui/source-rules.test.ts` forbids `.style` / `setAttribute('style', …)` in UI TypeScript,
  while AC5 requires the inline custom property `--ui-deal-index`. The results screen sets it
  through `h()`'s attribute map when a row (and, as `--ui-deal-count`, the placing roundel) is
  created. These custom properties are the only inline styles, and they never carry a colour.
- Motion for rows and the roundel is not specified beyond "dealt 40ms apart, then the placing roundel
  stamps" (UI_RULES §7). Rows drop in along their shadow like the overlay drop (slide 200ms, snap).
  The roundel stamps (160ms, stamp ease) once the last row has been dealt. A design check on board 05
  would confirm this.
- `finish-panel.ts` stays in place for its existing tests, but `createRaceUi` no longer uses it.
