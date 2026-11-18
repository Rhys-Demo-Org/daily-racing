## Judge

Verdict: **fail**: review.md has 1 claim(s) the diff contradicts

Blind scores: overall **9/10** · specMet 9 · styleMatch 9 · notBroken 9 · testsReal 9 · noSniffing 10 · scope 9 · noDuplication 9

Adds Pine Ridge (forest-ridge.json): 3 laps, width 11, angular centreline, 2 ramps, dense cone trees, third in the track list. tracks.ts gains TRACK_LOCKS, isTrackLocked and a try/catch reader and writer for racer.finished.<id>. nextTrackId skips locked tracks only when no ids are passed. game.ts saves the player's finish on the tick car 0 finishes, before results are left. The start screen takes an injectable locked() check and re-reads it on every show() and select(). Clicks, arrows and select() skip locked cards, and a card locked again hands the selection to the first unlocked one. The locked card uses only theme tokens, with an SVG padlock (role img, label Locked). New stage start--menu-unlocked. Screenshots at 844×390 and 1440×900 match the S6 mockup: dark-dirt card, ink road, cream padlock roundel, cream name, dashes for best. All four cards and RACE fit unclipped. Race frames show dense pines. Tests cover every AC through the DOM, game and content data, plus a Chromium fit check and edge cases (bot finish doesn't unlock, re-lock, blocked storage). All gates pass. Small deviations: race-ui.ts was listed in Expected files but not changed, and a few extra test files were added. Neither is harmful.

Review claims: 9 confirmed, 4 unconfirmed, 1 contradicted.
