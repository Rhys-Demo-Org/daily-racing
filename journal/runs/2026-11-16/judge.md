## Judge

Verdict: **pass**

Blind scores: overall **8/10** · specMet 9 · styleMatch 9 · notBroken 8 · testsReal 9 · noSniffing 10 · scope 8 · noDuplication 9

B12 adds optional track `pickups`, validated and laid out in world space. Dust Bowl gets two rows of three small mustard cubes on its straights. Only car 0 collects them, with a 300-tick respawn and no stacking. Firing with `action` gives a 90-tick boost by swapping in a surface tuning with topSpeed 32, and nothing else in the car changes. Space and the touch zone latch taps between reads, replays use bit 2, and RaceView adds pickup and armed fields only on pickup tracks. Bot laps and physics replays are unchanged (G2/G3 at +0.0%). The ⌀64 Boost roundel above GAS matches the S1–S2 mockup: dirt with a dark-dirt bolt when unarmed, mustard with an ink bolt when armed. The SPACE · POWER-UP mustard keycap matches the desktop mockup. Dust Bowl frames show the outlined cubes with blob shadows on the dirt, and the armed button mid-race. The tests go through public seams (createWorld/stepWorld/raceView, createInput, createRaceUi, createRaceScene) and pin the observable behaviour: exactly 300 ticks hidden, boostTicks 90→0 with speed ≤ 32, identical views on Bramble Bends. Extra fixes are justified: input reset on resume, and Space on a focused menu button. Two minor issues: the replay decoder adds `action` as a non-enumerable property, which is fragile, and one header comment is rewrapped into an over-long line. Ready to offer.

Review claims: 11 confirmed, 2 unconfirmed, 0 contradicted.
