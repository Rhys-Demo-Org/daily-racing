## Your area: ui and input (`src/ui/**` except `src/ui/stages/`, `src/input/**`, their CSS)
The DOM HUD, screens and controls. Look for duplicated DOM-building or formatting code, CSS rules
repeated across files, dead modules and exports, and listeners or timers whose lifetimes can be
simplified without changing behaviour. Every screen's DOM and computed styles must stay identical.
