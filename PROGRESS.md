# Progress Log

> Update this file at the end of every work session, before handing back for review.
> A new session should be able to read this file alone and know exactly where things stand —
> check here before re-reading REQUIREMENTS.md or PLAN.md in full.

## Current phase
Phase 2 — Deterministic self-healing (no AI)

## Status
Ready for review — the fallback-healing hook, the manifest+spec patch mechanism, and a
deliberately-broken-locator demo all work end to end and were verified live (not just read
through). All 4 specs pass green on chromium.

## Completed this session
- Merged `feature/locator-manifest` into `main` (Phase 1 sign-off — done before this phase
  started; you committed/merged it yourself).
- `tests/support/resilient-locator.ts`: `resilientLocator(page, specRelativePath, elementKey,
  primaryFactory, opts?)`. Tries the primary locator first with a short `waitFor({state:
  'visible'})` — manifest is never read on this path, per REQUIREMENTS.md 3.2. On timeout,
  loads `manifests/<spec>.json` and tries each `fallbacks[]` entry in order (via
  `scripts/lib/manifest.js`'s `buildLocatorFromEntry`); first one that resolves wins. Logs a
  `[SELF-HEALED] spec=... element=... fallback#N strategy=...` line and appends a JSON event to
  `test-results/healing-events.jsonl` (path overridable via `HEALING_LOG_PATH` — the real
  `test-results/` in this sandbox is root-owned from an earlier `docker compose run`, see
  Decisions below). If every fallback also fails, rethrows the original error — test fails for
  real, nothing logged/patched.
- `scripts/lib/manifest.js`: shared `manifestPathForSpec`/`loadManifestForSpec`/`saveManifest`/
  `buildLocatorFromEntry` (manifest entry → real Locator) /`codeForEntry` (manifest entry →
  the Playwright source code string for it, used when patching a spec file). Refactored
  `generate-manifest.js` to reuse `manifestPathForSpec` instead of duplicating the path logic.
- `scripts/lib/patch-spec-locator.js`: TypeScript-compiler-API-based patch — finds the exact
  `resilientLocator(page, spec, 'elementKey', () => <expr>)` call for a given element key and
  replaces just `<expr>`, leaving the rest of the file untouched. Chosen over regex because a
  locator's own arguments can contain commas/parens that make "find the matching close paren"
  unreliable with naive string matching.
- `scripts/apply-healing-patches.js`: reads `healing-events.jsonl` (deduped to the latest event
  per spec+element), patches the manifest (new primary = the working fallback; old primary
  demoted into `fallbacks`) and the spec file for each, commits both to a local
  `auto/healed-<unix-ms>` branch, then switches back to whatever branch you were on. Does
  **not** `git push` or `gh pr create` — prints those commands for a human to run after
  reviewing the diff (per your explicit choice this session — see Decisions).
- `tests/self-healing-demo.spec.ts` + `manifests/self-healing-demo.json`: worked example with a
  deliberately broken primary locator (stale CSS selector) and a correct role-locator fallback.
  Verified live: primary fails, `[SELF-HEALED]` logs, test still passes, event lands in
  `healing-events.jsonl`, and `apply-healing-patches.js` correctly rewrites both files (verified
  via `git diff` against the resulting `auto/healed-*` branch, then reverted for reasons below).
- **Bug found and fixed during this session's own testing** (not just written and assumed
  correct): `resilientLocator`'s fallback loop swallowed *any* error from `recordHealingEvent`
  (including this sandbox's `test-results/` `EACCES` permission error) inside the same
  catch-and-try-next-fallback block, which made a successfully-healed locator look like a
  failed one and masked the real cause. Fixed by moving the healing-event write into its own
  try/catch that only warns, so a logging failure can never affect whether the healed locator
  is actually returned.
- **Second bug found and fixed**: `apply-healing-patches.js`'s "patch, commit to a new branch,
  switch back" flow only correctly restores the original branch if the patched files were
  already committed there. Ran it against this session's own uncommitted demo files as a live
  test — confirmed they got committed onto the new `auto/healed-*` branch and then *disappeared
  from the working tree* on switching back (recoverable via the other branch, not actually
  lost, but a real surprise/footgun for a script that mutates git state). Fixed by adding
  `assertCleanAndTracked()`, which now refuses to run unless every file it would touch is
  already committed and clean on the current branch. Re-verified the guard fires correctly
  instead of repeating the bug.
- Full 4-spec suite (`smoke`, `theme-toggle`, `search-locators`, `self-healing-demo`) verified
  green together on chromium after both fixes.

## Pending / next steps
- Hand off `feature/deterministic-healing` for human review.
- Firefox/webkit not re-verified this session (chromium only, natively) — full 3-browser pass
  should happen in Docker before/at merge, same caveat as Phases 0-1.
- `apply-healing-patches.js` was only exercised against the demo spec in isolation (git branch
  create/commit/switch-back, and the AST patch, each verified working) — never run against an
  *already-committed* baseline end-to-end in this session, since committing is your call, not
  mine. Worth a human dry run: commit the demo files as-is (still showing the broken primary),
  run the suite, then run `apply-healing-patches.js` for real.
- CI isn't wired to run `apply-healing-patches.js` automatically after a healed run, nor does
  the CI log distinguish "healed" from "clean pass" beyond the `[SELF-HEALED]` console line —
  the fuller CI cost/time separation from REQUIREMENTS.md 3.4 is more naturally a Phase 3 thing
  (that's when AI cost enters the picture), but flagging it wasn't fully addressed here either.
- Existing Phase 1 tests (`smoke`, `theme-toggle`, `search-locators`) don't use
  `resilientLocator` — only the new demo test does. Migrating them is optional, not required by
  PLAN.md's Phase 2 "done when" criterion, but worth deciding before Phase 3.
- Start Phase 3 (AI healing escalation) only after this branch is reviewed/merged into `main`.

## Decisions & deviations from PLAN.md
- The patch/commit mechanism runs as a **separate script after the test run**
  (`apply-healing-patches.js`), not inline inside the failing test's fixture teardown. Reason:
  Playwright runs specs across multiple parallel workers sharing one working directory: a
  fixture doing `git checkout -b ...` mid-suite would switch branches out from under other
  still-running workers reading the same files. Healing events are just logged during the run;
  the git/patch work happens once, afterward, from a clean state.
- Per your explicit choice this session, the healing-patch mechanism stops at a local commit on
  `auto/healed-<timestamp>` — it never runs `git push` or `gh pr create` itself. Those are
  printed as the next command for a human (or a future CI job) to run once they've reviewed the
  diff.
- `assertCleanAndTracked()` guard (see bugs above) is a deviation from the plain reading of
  PLAN.md's "auto-patch the `.spec.ts` file and manifest" — added after this session's own demo
  run exposed a real file-loss risk when the target files weren't already committed. This means
  self-healing genuinely only works against already-committed specs, which matches how it'd
  actually be used in CI anyway (you don't run CI against uncommitted files).
- `HEALING_LOG_PATH` env var was added so the healing-event log location is overridable —
  needed because this sandbox's real `test-results/` is root-owned from an earlier `docker
  compose run --rm tests` (Phase 0) and isn't writable by the current user; see open question
  below. Not purely a workaround — also lets CI redirect the log to a separate artifact
  directory if useful later.

## Open questions for the human
- This sandbox's `test-results/` and `playwright-report/` directories are still root-owned
  (`drwxr-xr-x root root`) from an earlier Docker run and this user account can't chown/delete
  them without a sudo password. Native (`npm test`, not Docker) runs will keep hitting `EACCES`
  writing reports/traces until you run `sudo chown -R $USER:$USER test-results
  playwright-report` (or delete+let them regenerate) yourself.
- Still no real app under test — all 4 example specs target playwright.dev. Once/if a real app
  exists, these should probably be replaced or supplemented with real ones.
- Should the 3 pre-existing Phase 1 tests be migrated to use `resilientLocator` too, or is one
  dedicated demo test enough to prove the pipeline for now?

## Branch
- `feature/deterministic-healing` — ready to hand off for review.
