## B03 · AI liveries and driver roster
depends_on: none
scope: A data-only driver roster in `src/content/` with the five AI drivers from the mockups:
KOSKI #7 mustard, BRUNO #23 navy, DEL RIO #4 teal, MAGS #9 cream, OTTO #12 grass; player is YOU #1
rally-red with cream stripe and ▼ marker. Car builder applies each livery: body colour, stripe,
race number on the cream roof roundel, navy cabin (teal cabin on the navy car), ink wheels. AI
cars are never rally-red. Results/finish UI uses roster names.
Mockups: S1–S2, S5, desktop HUD; rules: UI_RULES §8.
done_when: each roster entry builds a car whose palette indices match its livery; no AI livery
uses rally-red; the navy car has a teal cabin; the bot in a race uses the first roster entry.
