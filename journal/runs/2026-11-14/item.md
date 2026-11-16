## B09 · HUD event motion
depends_on: none
scope: The race HUD moves on events per UI_RULES §7 and board 05: position digit rolls and its
panel bumps (×1.12) on a position change; lap panel stamps on a new lap; HUD panels slide in from
their own edge at race start; touch controls pop 0.9→1 when woken and retract their shadow when
resting. Transform / box-shadow / clip-path / visibility only; reduced motion keeps press only.
done_when: each event adds its motion class with the token duration and easing; with
`prefers-reduced-motion` only the press sink remains.
