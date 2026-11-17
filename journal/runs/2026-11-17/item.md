## B13 · Rivals use pickups
depends_on: B12
scope: On tracks with pickups (Dust Bowl), the AI opponents (cars 1 and up) collect and fire boosts
by the same rules as the player: driving through a present box while unarmed arms that car and
takes the box for everyone (same 300-tick respawn); firing with CarInput `action` gives the same
90-tick boost. Each bot decides when to fire from world state only, so a race stays reproducible
from the seed and the player's inputs: e.g. once armed, on a straight with no ramp or tight corner
just ahead. Bots may drift toward a box near their line but never far enough to get stuck or lose
the racing line. `createBot(world, 0)` (the bot that drives car 0 in tests and gate bot laps) never
fires. Every racer view carries its own `armed` and `boostTicks`. No new visuals: an AI taking a box
makes it vanish exactly as when the player does. Placed ahead of B11 by the owner, 2026-11-16.
Mockup: none (mechanics only).
done_when: in a six-car Dust Bowl race, AI cars take boxes (the box vanishes and their racer view
shows armed) and fire boosts (boostTicks 90 counting down, speed above 25 and never above 32); a
box an AI took is unavailable to the player until it respawns; an armed AI leaves other boxes
present; runReplay of a recorded race reproduces it exactly; bots still finish every registered
track; Bramble Bends and Hay Loop behave exactly as before.
