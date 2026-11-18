# Design request · locked track card motion (B11)

UI_RULES §7 says "cards lift 2px on hover, locked cards shake", but gives no amplitude, timing,
easing or trigger for the shake (hover? press? a click on the locked card?), and board 05 has no
locked-card demo.

Tonight's locked Pine Ridge card (S6) therefore has no shake: it keeps its ink shadow and focus ring
but does not lift on hover/focus or sink on press, so it never suggests it can be picked.

Please specify:
- what triggers the shake (press/click on a locked card, arrow-key landing, or hover);
- its distance (px), number of swings, duration (one of press 60 · release 120 · stamp 160 · slide
  200 · wipe 250?) and easing;
- whether reduced motion cuts it entirely.
