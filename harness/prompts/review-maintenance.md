## Tonight is a maintenance night
There is no feature: the diff applies cleanup items from the persistent list (see `/inputs/spec.md`)
and must not change behaviour. Any change a player could see or feel (laps, physics, a screen's DOM
or styles, the scene's geometry or colours, input handling, timing) is a **critical** finding, even
where the gates passed. Net `src/` lines must not grow, and no existing test may be edited or
deleted. Judge the refactor by whether the code is now smaller, simpler or less duplicated.
