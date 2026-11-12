## B07 · Best-lap persistence and new-best chip
depends_on: none
scope: Store the best lap per track in `localStorage` (wrapped in try/catch; works without it).
The HUD BEST chip shows the stored best ("-:--.--" if none). When a lap beats it, a mustard
"NEW BEST" chip slides out from under the TIME panel (UI_RULES §7) and the result chip on the
finish/results screen says "NEW BEST LAP".
Mockups: S1–S2 (BEST chip), S5 (best lap chip).
done_when: a faster lap updates the stored and displayed best; a slower lap doesn't; the chip
appears only on a new best; the game runs when storage throws.
