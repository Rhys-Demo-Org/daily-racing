## Judge

Verdict: **pass** (after the fix round)

Blind scores: overall **9/10** · specMet 9 · styleMatch 10 · notBroken 10 · testsReal 7 · noSniffing 10 · scope 10 · noDuplication 10

All six chosen items are applied as the spec describes. C024: the render barrel no longer re-exports frameWidthFor, CameraRig, CarObject, DustPool, LIGHT_DIRECTION, TOON_STEPS or Materials, line 9 is deleted, countdownOffsetEast and the keep-list names stay, and the header comment is updated. C007: export is dropped from smoothNormals, CREASE_ANGLE_DEG, attachOutline, OUTLINE_PX_AT_844 and MaterialKind, and the branch inventory confirms they are gone. C042: groundUnderBody/visualPose now write into module scratch (bodyTs/bodyHs/bodyN, pose), with the same float operations in the same order. Bot laps and replays are exact, and sampled allocations dropped on every track, though a groundUnderBody site stays near main's level on dust-bowl. C011, C030 and C040 are comment-only fixes. All gates are green (P1/P2 identical, net src +16 is allowed for the perf item), there are no clones and no sniffing. The one new test file has a weak push-monkeypatch assertion next to a meaningful order-independence check.

Review claims: 9 confirmed, 4 unconfirmed, 0 contradicted.
