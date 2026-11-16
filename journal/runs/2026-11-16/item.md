## B12 · Pickups and the action button
depends_on: none
scope: Mustard pickup boxes placed on tracks (declared in track JSON, opt-in per track so existing
replays don't change; added to Dust Bowl only). Driving through one grants a single boost: the
action button (⌀64, above GAS, lightning icon) and Space on desktop fire it; the action button
"pops" when a pickup is collected. Boost is a short deterministic speed bump in the sim.
Mockups: S1–S2 (action button), desktop HUD (SPACE power-up keycap).
done_when: collecting a pickup arms the action control; firing it raises speed for a fixed number
of ticks then returns to normal; pickups respawn after a fixed time; tracks without pickups behave
exactly as before (replays unchanged).
