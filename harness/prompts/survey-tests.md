## Your area: tests (`tests/**`)
Existing tests can't be edited or deleted tonight, so most test findings are
`test-pins-internals` (for the owner): tests that import or assert internal names instead of a
public seam (the DOM by role and text, `RaceView`, `window.__racer`, exported content data), tests
that keep dead code alive, duplicated test helpers. Name the test and the internal it pins. What a
night can do is add **new** tests: report missing coverage of important behaviour as `tests`, with
the behaviour to cover.
