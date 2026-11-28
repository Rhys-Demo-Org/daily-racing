## Judge

Verdict: **pass**

Blind scores: overall **8/10** · specMet 9 · styleMatch 9 · notBroken 8 · testsReal 9 · noSniffing 10 · scope 8 · noDuplication 10

This PR builds B14. The S6 card row now follows UI_RULES §12: cards shrink to a min-width of 2×s7 (96px; ×1.45 on desktop), then the row scrolls with x mandatory snap, a snap point per card, no scrollbar and the next card peeking in. RACE stays outside the row. Negative-margin padding keeps the shadow and focus ring from being clipped. Locked cards shake on click, tap or Enter/Space (Enter/Space call preventDefault and only act on locked cards) with one Web Animation: translateX 0/4/−4/4/0, 250ms, snap easing, from tokens. It has no fill, cancels any running shake, and doesn't run under reduced motion. It reuses screen-change's reducedMotion, now exported. A new eight-card stage uses mirrored fixture tracks. The screenshots match the S6 mockup and the existing four-card layout, which looks unchanged on phone and desktop. The tests drive real Chromium through roles and the Web Animations API, cover every AC including the name-wrap check the audit asked for, and fail on main. All gates are green. Minor points: at 96px the selected card's BEST time is clipped, a known open point that goes to the owner's design request. There are also a few small unlisted extras: two extra tests and scrollIntoView on pick/show.

Review claims: 8 confirmed, 4 unconfirmed, 0 contradicted.
