## B08 · Title and track select (S6) with stripe screen change
depends_on: B07
scope: Replace the Phase 0 start screen with S6: navy title panel ("DAILY AI RACER", triple
stripe, player car), dirt ground with SELECT TRACK and one card per registered track (outline
thumbnail drawn from the track's centreline as SVG, name, stored best), mustard selected card,
RACE button. Screen changes use the triple-stripe sweep (250 ms, stripes 40 ms apart); entering a
race uses the chequer band. The settings button in the mockup is out of scope (no settings
design exists). Mockup: `mockups/S6-title-track-select.png`.
done_when: every registered track has a card; selecting a card and pressing RACE starts that
track; each card shows that track's stored best; the stripe sweep runs between screens.
