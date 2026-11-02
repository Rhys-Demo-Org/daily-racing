## B02 · Results screen (S5)
depends_on: none
scope: Replace the Phase 0 finish panel with the S5 results screen: solid navy ground, triple
stripe across the top, "RACE COMPLETE · 3 LAPS" label, track name, big placing roundel (1ST/2ND…,
rally-red), the player's best lap of this race in a mustard chip, and a table of POS / DRIVER /
TIME / GAP with rows dealt 40 ms apart and the player's row in rally-red. RETRY and NEXT RACE
buttons (NEXT RACE goes to the next registered track, wrapping). Drivers without names yet show
as "YOU · #1" and "CPU · #n".
Mockup: `mockups/S5-results.png`.
done_when: finishing a race shows one row per car in finishing order with correct times and gaps
(leader "–"); placing roundel matches the player's position; RETRY restarts the same track;
NEXT RACE loads the next track.
