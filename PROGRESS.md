# Progress Log

> Update this file at the end of every work session, before handing back for review.
> A new session should be able to read this file alone and know exactly where things stand —
> check here before re-reading REQUIREMENTS.md or PLAN.md in full.

## Current phase
Phase 5 — React frontend shell

## Status
Ready for review on `feature/webapp-frontend`. Phase 4 (backend API & storage) is also ready for
review on `feature/webapp-backend`, from the same session — see that phase's section below.
Both branches currently sit at the same base commit as `main` (nothing new has been committed by
me this session, per your standing instruction — you commit, I don't), so `feature/webapp-
frontend`'s working tree also contains Phase 4's uncommitted files; they'll need to land together
or you'll want to rebase one onto the other once you start committing.
Correction to earlier entries in this file: Phase 2 (deterministic self-healing) is **already
committed on `main`** (`git log` shows it as `main`'s tip commit, "Phase 2 work is complete" —
the human committed it directly rather than via a merge commit); the "ready for review on
`feature/deterministic-healing`, not yet merged" note further below is stale and left only as
history.

## What changed this session (the pivot)
- User tried the Phase 1 zenity-based recorder and the CLI run instructions from a remote/
  browser-only context — surfaced that the whole CLI/git delivery model doesn't fit the actual
  target user (someone who only ever has a browser, no local install, no git, no CLI).
- Decided, via three explicit choices this session:
  1. **Recording UX** → server-side Playwright browser per session, screen-streamed into the
     user's own browser (like BrowserStack/LambdaTest-style recorders) — not a browser
     extension, not client-side iframe capture.
  2. **Tenancy** → single shared login, one pool of test cases, no per-tenant accounts/billing.
  3. **Healing review** → in-app Pending Fixes queue with Approve/Reject, replacing the
     git-branch/PR mechanism built in Phase 2 entirely (not layered on top of it).
- Rewrote `REQUIREMENTS.md`: new Purpose framing (hosted web app, non-technical user, no
  CLI/git), Section 3 functional requirements rewritten around recording-via-streamed-browser,
  in-app Pending Fixes review (3.3), one-click run + in-app reporting (3.4), test management
  (3.5, new). Section 5 (out of scope) now explicitly calls out git-based PR review as
  **removed**, not deferred.
- Rewrote `PLAN.md`: Phases 0-2 kept as "done" but annotated with which user-facing parts are
  superseded vs which internals get reused. Added Phase 4 (backend API/storage), Phase 5 (React
  shell), Phase 6 (recording session infra — the streamed-browser piece), Phase 7 (one-click
  execution/reporting), Phase 8 (in-app healing review queue, replacing Phase 2's git-PR
  output), Phase 9 (AI healing — renumbered from the old Phase 3, now surfaces into Phase 8's
  queue instead of a PR), Phase 10/11 (quality add-ons / hardening — same intent as the old
  Phase 4/5, renumbered).
- Updated `CLAUDE.md`'s Project status to point at the pivot and flag Phase 4+ as
  planning-only, no code, don't start without explicit go-ahead.

## Completed (Phase 2 session — unchanged since, still ready for review)
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
  `resilientLocator` — only the new demo test does. Given the pivot, this is moot for the
  CLI-based product but the same question resurfaces for whatever Phase 6's recorder generates.
- Per the pivot (see above), do **not** start Phase 3/9 (AI healing) next. Next up, once
  explicitly requested, is Phase 4 (backend API/storage) — and only after `main` has this
  branch's work merged, since Phase 4 wraps this engine rather than replacing it.

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
- Pivot-related, deferred until code is requested: backend stack/framework choice (plain
  Express vs something else), storage choice for Phase 4 (files-on-disk vs a real DB),
  screen-streaming approach for Phase 6 (raw CDP screencast vs an existing library), and
  hosting/deployment target for the whole app. Not blocking the plan itself, just noting they'll
  need answers before Phase 4/6 implementation starts.

---

## Phase 4 session — Backend API & storage foundation

## Completed this session
- Installed `express` (dependency) and `@types/express` (devDependency); no other new plugins/
  packages were needed — `frontend-design` (already installed) covers Phase 5's UI work when
  that starts.
- `server/src/storage/{testsStore,runsStore,pendingFixesStore}.ts` — file-backed JSON stores.
  `testsStore` owns test-case metadata (id/name/specPath — a pointer at an already-committed
  `.spec.ts`; authoring the spec itself is Phase 6). `runsStore` owns one JSON file per run
  under `server/data/runs/` plus an index for fast per-test listing. `pendingFixesStore` is the
  storage foundation for Phase 8's review queue — nothing writes to it yet (see Decisions).
- `server/src/runner.ts` — `runSpec(repoRoot, specPath)` shells out to `npx playwright test
  <spec> --project=chromium --reporter=json`, parses the JSON reporter's `stats`, and reads back
  any `HEALING_LOG_PATH` events from that run (pointed at a per-run temp file so concurrent runs
  never collide). No AI anywhere on this path — it only drives the existing Phase 1/2 engine.
- `server/src/auth.ts` — HTTP Basic auth against a single shared `APP_USERNAME`/`APP_PASSWORD`
  (env vars, no defaults — server refuses to start without both), using
  `crypto.timingSafeEqual` for constant-time comparison.
- `server/src/routes/{tests,pendingFixes}.ts` + `server/src/app.ts` — Express app factory
  wiring: `GET /api/health` (unauthenticated), `GET/POST /api/tests`, `PATCH|DELETE
  /api/tests/:id`, `POST /api/tests/:id/runs`, `GET /api/tests/:id/runs`, `GET /api/runs/:runId`,
  `GET /api/pending-fixes`, `PATCH /api/pending-fixes/:id`. `specPath` is validated against path
  traversal (must resolve inside `repoRoot`) and must already exist as a `.spec.ts` file.
- `server/src/index.ts` — entrypoint; `node server/src/index.ts` runs directly, no build step
  (see Decisions on why there's no `ts-node`/`tsx` dependency).
- `server/test/app.test.ts` — 6 `node:test` integration tests hitting the real Express app
  in-process (ephemeral port, throwaway `DATA_DIR` per test): auth gate, full test-case
  CRUD + duplicate/path-traversal/missing-file rejection, pending-fixes list/filter/approve/
  reject, and a **real** `npx playwright test` invocation (against a throwaway no-browser spec,
  so it stays fast and network-free) verified end-to-end through `POST .../runs` →
  `GET /api/runs/:id` → `GET /api/tests/:id/runs`. All 6 pass (`npm run test:server`).
- Manually verified beyond the automated suite: started the server for real
  (`APP_USERNAME=... APP_PASSWORD=... npm run server:start`) and curled it end-to-end, including
  triggering a real run of `tests/smoke.spec.ts` (actual chromium browser, real network hit to
  playwright.dev) through the API and reading the structured result back — not just the fast
  no-browser test-suite path.
- `npx tsc --noEmit` passes clean across the whole repo (tests/scripts/server); re-ran the
  existing 4-spec Playwright suite on chromium natively — still 4/4 green, no regression from
  the `tsconfig.json` change.
- Updated `README.md` with a "Backend API (Phase 4)" section; added `server/data/` to
  `.gitignore`; added `server:dev`/`server:start`/`test:server` npm scripts.

## Decisions & deviations from PLAN.md
- **No `ts-node`/`tsx` dependency.** Node 24 runs `.ts` files directly (type-stripping, stable
  since Node 23.6+), confirmed working for this repo's CJS style (`require`/`module.exports` +
  `import type` for cross-file types, which fully erases at runtime). Discovered along the way:
  Node's ESM-vs-CJS auto-detection looks at *runtime* syntax, not just presence of `import`/
  `export` — `import type` and `export interface` are fully erased and stay CJS-safe, but a real
  `export function`/`export const` forces ESM detection (and then `require()` inside that same
  file breaks). Every server file was written CJS-style (`function foo() {} ... module.exports =
  { foo }`) for this reason, with `export interface`/`export type` kept alongside for
  cross-file type imports. Internal `require()`s need explicit `.ts` extensions (Node's CJS
  resolver doesn't probe `.ts` implicitly the way it does `.js`).
- Added `"moduleDetection": "force"` to `tsconfig.json`. Needed because a handful of server
  files (`index.ts`, the test file) have no `import`/`export` at all, and TypeScript's default
  behavior treats such files as global "scripts" — their top-level `const`s were colliding
  across files in the same `tsc` program. This option makes tsc treat every file as an isolated
  module regardless, with no runtime effect (verified `node --test`/`node server/src/index.ts`
  still work identically after adding it).
- **`POST /tests/:id/runs` is synchronous** (blocks the HTTP request until Playwright finishes,
  ~120s timeout) rather than a background job with polling. Chosen for Phase 4's scope — a job
  queue is real added complexity Phase 4 doesn't ask for; one-click execution UX (Phase 7) is
  where that trade-off should get revisited if a full run takes too long for a synchronous
  request in practice.
- **Run defaults to `--project=chromium` only**, not all 3 browsers, to keep the request/response
  cycle fast. No option to run all 3 was added — not asked for in Phase 4's "done when" criteria;
  worth deciding explicitly before Phase 7 builds real reporting on top of this.
- **Pending Fixes storage has no create endpoint** — only `list`/`get`/`update` are routed;
  `add()` exists on the store for Phase 8 (and this session's own tests) to call directly, since
  nothing populates the queue yet. Phase 2's healing pipeline still logs to
  `test-results/healing-events.jsonl`/`HEALING_LOG_PATH`, unchanged — wiring that into this store
  instead is explicitly Phase 8's job per PLAN.md, not done here.
- **`POST /tests` requires an already-existing `.spec.ts`** (not authoring one) — test authoring
  via the app is Phase 6's job (the recording session). This endpoint only registers metadata
  pointing at a spec a human already committed.
- Backend lives under `server/` as CommonJS-with-TypeScript rather than a separate npm workspace
  or a `dependencies`-only split — kept in the same `package.json` since there's no build step to
  isolate and Phase 4 is meant to be a thin wrapper, not a second product.

## Open questions for the human
- **PROGRESS.md itself had a stale claim going into this session**: it said Phase 2 was "ready
  for review on `feature/deterministic-healing`, not yet merged," but `git log` shows Phase 2's
  commit ("Phase 2 work is complete") is already `main`'s tip — i.e. already landed, just never
  via an actual `git merge`. Worth deleting or renaming the now-redundant
  `feature/deterministic-healing` branch (it points at the same commit as `main`) next time
  you're doing branch cleanup.
- File-based JSON storage (chosen over a real DB per Phase 4's "still plain files on disk" first
  option) — fine for a single shared-login v1, but worth an explicit decision before Phase 7/8
  add concurrent-write-heavy features (scheduled runs, a busier Pending Fixes queue), since the
  current stores have no locking (last-write-wins on concurrent writes to the same JSON file).
- No CORS handling added — Phase 5's React frontend will need either a dev-server proxy or CORS
  middleware here, depending on how it's hosted relative to this API; deliberately left
  undecided since Phase 5 hasn't started.
- Same root-owned `test-results`/`playwright-report` issue from the Phase 2 session is still
  unresolved (`sudo chown -R $USER:$USER test-results playwright-report` — your call, needs a
  password).

---

## Phase 5 session — React frontend shell

## Completed this session
- Scaffolded `web/` via `npm create vite@latest web -- --template react-ts`; added
  `react-router-dom`. No other new plugin was needed — `frontend-design` (already installed)
  supplied the design-system approach used below.
- Design pass (see the `frontend-design` skill invocation this session): a small named token
  system in `web/src/index.css` — pale sage-tinted paper background (not the cream+terracotta
  default), Space Grotesk/Inter/IBM Plex Mono type pairing, and status colors borrowed from lab-
  instrument signal lamps (teal=passed, amber=healed, crimson=failed). The signature element is
  `StatusLamp` (`web/src/components/StatusLamp.tsx`) — a dot+label repeated everywhere a
  test/fix has a state, since "what state is this in" is the whole point of the app.
- `web/src/api.ts` + `web/src/auth/` — typed fetch client for every Phase 4 endpoint;
  credentials held in `sessionStorage` (cleared on tab close), attached as a Basic-auth header
  on every request. `web/src/types.ts` hand-mirrors the server's JSON shapes (see Decisions on
  why it's not a shared package).
- `web/vite.config.ts` proxies `/api` to the backend (`API_PROXY_TARGET` env override, defaults
  to `:4000`) — resolves the CORS open question from the Phase 4 session without touching the
  server.
- Screens: `LoginPage` (validates credentials against a real API call, not just a format check),
  `Layout` (sidebar nav + Pending Fixes badge), `TestListPage` (list + latest-run status lamp +
  "New Recording" entry point), `TestDetailPage` (rename/delete/run + run history), 
  `PendingFixesPage` (approve/reject with an old→new locator diff), `RecordStubPage` (honest
  placeholder — Phase 6 builds the real recorder). `ProtectedRoute` redirects to `/login` when
  logged out.
- **Verified live in a real browser** (Playwright MCP browser tools), not just built: started
  both the backend and `npm run dev`, seeded real test/run/pending-fix data through the actual
  API (including a real chromium run of `smoke.spec.ts` triggered from the Run button), and
  clicked through login → test list → test detail → run → Pending Fixes → approve → logout →
  redirect-when-logged-out. Screenshots confirmed the design renders as specified.
- `npx tsc -b` (in `web/`) and `npx tsc --noEmit` (repo root, still covering `server/`) both
  clean.

## Bugs found and fixed during this session's own testing (not just written and assumed correct)
- **Login with a wrong password hung forever** instead of showing an error. Root cause: the
  Phase 4 backend's 401 responses sent a `WWW-Authenticate: Basic` header
  (`server/src/auth.ts`). Browsers treat that header as an invitation to pop their own native
  HTTP-auth credential dialog on *any* `fetch()`/XHR that gets a matching 401 — even though this
  app has its own login form and never wants that dialog. The fetch promise then just sits
  pending until someone answers a dialog the app doesn't know exists. Caught by actually
  submitting a wrong password through the real UI (the automated backend test suite never would
  have caught this — it doesn't run in a browser). Fixed by dropping the `WWW-Authenticate`
  header from both 401 branches in `auth.ts`; the JSON error body is unchanged. Confirmed fixed
  by re-testing the same wrong-password flow live (instant response + visible error message) and
  re-running `npm run test:server` (still 6/6 green — no test had been asserting on that header).
- **Sidebar "Pending Fixes" badge count didn't update after approving/rejecting from that same
  page** — it was fetched once in `Layout` on mount and never refreshed. Caught by clicking
  Approve live and noticing the badge still said "1". Fixed by lifting the count into
  `web/src/state/PendingFixesCountContext.tsx`, shared between `Layout` and `PendingFixesPage`
  so both read/refresh the same state; `PendingFixesPage` now calls `refresh()` after every
  approve/reject. Re-verified live: the badge disappears immediately after Approve, no reload
  needed.

## Decisions & deviations from PLAN.md
- **Wired to the real Phase 4 API from the start**, not mocked/static data — PLAN.md allows
  either ("can be built against mocked/static data if Phase 4's API isn't fully ready yet"), but
  since Phase 4 was already built and verified this session, using the real API meant every
  screen got tested against real behavior (which is exactly how the two bugs above were found).
- **Types are hand-mirrored, not shared via a workspace package** (`web/src/types.ts` duplicates
  shapes from `server/src/storage/*.ts`). `server/` is CommonJS run directly by Node;
  `web/` is an ESM/bundler-mode Vite app — bridging them would need a proper npm workspace, which
  is more setup than these five small JSON shapes justify right now. Worth revisiting if the
  contract grows or drifts.
- **Credentials in `sessionStorage`**, not `localStorage` — closing the tab logs you out, matches
  "single shared login for the team" without needing a real session/token layer yet. No 401-
  triggered auto-logout was added (a stale/revoked credential currently just fails each request
  with a visible-enough error per screen); worth adding a global interceptor if that proves
  annoying in practice.
- **No dedicated "register an existing spec" UI** on the test list page, even though Phase 4's
  API supports it — test authoring is Phase 6's job (the recording session) per PLAN.md; adding
  a parallel path to create tests by typing a file path would work against that framing. Seeded
  test data for this session's live verification directly via `curl`/the API instead.
- **`PendingFixesCountContext` exists solely to fix the staleness bug above** — a small addition
  beyond the original screen list, justified by being a real bug found in testing, not
  speculative infrastructure.

## Open questions for the human
- `feature/webapp-backend` and `feature/webapp-frontend` both currently have identical
  uncommitted working-tree state (both branched from the same `main` tip with nothing committed
  yet) — you'll want to decide how these become actual commits/branches once you start
  committing (e.g. one branch with both, or Phase 4 committed first and Phase 5 rebased onto
  it). Flagging so it's a deliberate choice, not an accident of how this session branched.
- No automated frontend test (e.g. a Playwright spec driving the built React app) was added —
  verification this session was live/manual via browser tools. Worth deciding whether Phase 5
  wants its own `.spec.ts` coverage (running frontend + backend together) before Phase 7 adds
  more UI surface on top.
- Same root-owned `test-results`/`playwright-report` issue from earlier sessions is still
  unresolved (`sudo chown -R $USER:$USER test-results playwright-report`).

## Branch
- `feature/deterministic-healing` — stale/redundant; same commit as `main`, safe to delete once
  confirmed.
- `feature/webapp-backend` — Phase 4, ready to hand off for review. Branched from `main`
  (includes the uncommitted pivot-doc rewrites from working tree at branch time, plus Phase 2's
  already-committed engine).
- `feature/webapp-frontend` — Phase 5, ready to hand off for review. Branched from the same
  `main` tip (per PLAN.md workflow — next phase from base, not the previous feature branch), so
  its working tree also carries Phase 4's uncommitted files alongside Phase 5's `web/`.
