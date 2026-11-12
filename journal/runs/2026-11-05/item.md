## B06 · Gamepad controls
depends_on: none
scope: Standard-mapping gamepads via the Gamepad API: left stick / d-pad steer (analogue steer
mapped onto the existing input range), right trigger gas, left trigger brake/reverse, A to
confirm on menus. Input is polled once per sim step into the same `CarInput` as keyboard and touch.
done_when: a mocked gamepad produces the same `CarInput` values as the equivalent keys; stick
dead-zone stops drift at rest; menus can be started with A.
