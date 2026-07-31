# Progress Log

> Update this file at the end of every work session, before handing back for review.
> A new session should be able to read this file alone and know exactly where things stand —
> check here before re-reading REQUIREMENTS.md or PLAN.md in full.

## Current phase
Phase 10 — Quality add-ons (accessibility + visual regression)

## Status
Ready for review, still on `feature/ai-healing` (uncommitted) — **same deviation as the Phase 8
session**: Phase 10 was built directly on top of Phase 9's still-uncommitted changes on the same
branch, since there was no clean commit yet to cut a fresh `feature/quality-checks` branch from.
If you want clean phase-per-branch history: commit Phase 9's files first on `feature/ai-healing`,
and Phase 10's files can move onto a fresh branch from that commit; otherwise both phases' diffs
are sitting together right now (see Branch section for the file split). Note also two untracked
files in the working tree that are **not** part of either phase and were left untouched:
`tests/aaqq.spec.ts` + `manifests/aaqq.json` — a real recording made through the app's own
recorder (Phase 6), presumably yours from testing the app; not migrated to the new `fixtures.ts`
import (see Decisions) since it isn't one of this repo's canonical example specs.

Phase 8/9 branch history: Phase 8 is committed (`4c48185` "Phase 8 done", `feature/webapp-
execution`'s tip); Phase 9 was built on a fresh `feature/ai-healing` branch cut from that commit
but is itself still uncommitted going into this session.

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
  should happen before/at merge, same caveat as Phases 0-1.
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
  them without a sudo password. Native (`npm test`) runs will keep hitting `EACCES` writing
  reports/traces until you run `sudo chown -R $USER:$USER test-results playwright-report` (or
  delete+let them regenerate) yourself.
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

---

## Housekeeping — Docker removal + a mid-session incident (this session)

**Docker removed, per your explicit instruction.** Deleted `Dockerfile` and
`docker-compose.yml`; `.github/workflows/tests.yml` now runs on plain `ubuntu-latest` with
`actions/setup-node@v4` + `npx playwright install --with-deps` (same command as local) instead
of the pinned container image. Updated every doc that referenced it — `README.md` (dropped the
"Via Docker" section, native run is now the only documented path), `CLAUDE.md` (Commands +
Architecture), `PLAN.md` (Phase 0 line), `REQUIREMENTS.md` (Section 4's "Consistent execution
environment" now describes pinning via `@playwright/test`'s npm version instead of a container
image), and the comment in `tests/smoke.spec.ts`. Re-ran the suite natively after deleting both
files to confirm nothing depended on them — still green.

**Incident, disclosed in full:** mid-session, while just trying to inspect branch state before
starting Phase 6, I ran `git checkout main -- .` — intending to check something, not meant as a
destructive command. Since `main` and the feature branches were all sitting at the same commit,
this silently reverted every *tracked* file in the working tree back to that commit's committed
content, discarding all uncommitted changes: your original pre-session pivot rewrite of
`CLAUDE.md`/`PLAN.md`/`PROGRESS.md`/`REQUIREMENTS.md`, this session's Phase 4/5 doc updates, and
the Docker-removal edits above — it also silently restored the just-deleted `Dockerfile`/
`docker-compose.yml`. It did **not** touch `server/` or `web/` (both untracked/new directories,
unaffected by `checkout -- .`), and it did not touch anything already committed.
I caught it immediately via `git status`/`git diff --stat HEAD`, and reconstructed every
affected file from this session's own conversation history (I had read or written the exact
prior content of each file earlier in the same session) — `.gitignore`, `tsconfig.json`,
`package.json` (regenerated `package-lock.json` via `npm install` against the restored
`package.json`, reconciled against the still-present `node_modules`), `.github/workflows/
tests.yml`, `tests/smoke.spec.ts`, `README.md`, `CLAUDE.md`, `PLAN.md`, `REQUIREMENTS.md`, and
this file. Re-ran `npx tsc --noEmit` and `npm run test:server` after reconstruction — both clean
— to confirm the rebuild was correct, not just visually similar.
**Why flagging this matters even though nothing appears lost:** the recovery relied entirely on
this conversation's in-context history being complete and accurate. If anything here reads as
subtly different from what you remember writing pre-session, say so — diff it against your own
memory/notes rather than trusting my reconstruction blindly.

---

## Phase 6 session — Recording session infrastructure

## Completed this session
- Added `ws` (dependency) and `@types/ws` (devDependency) — the one new package this phase
  needed.
- `server/src/recording/recorderScript.ts` — a plain function serialized via
  `Function.prototype.toString()` and injected with `page.addInitScript`, so it runs inside the
  recorded page itself. Listens for `click`/`change` on the real DOM and reports each one, with
  up to 4 candidate locator strategies per element (testId → role → css(short) →
  placeholder/text → css(full), ordered so a `css` candidate always survives length-capping) to
  `window.__recordAction__`. Deliberately heuristic, same spirit as `generate-manifest.js`'s
  `TODO`-marked fallbacks.
- `server/src/recording/session.ts` — `RecordingSession`: one headless `chromium.launch()` +
  context + page per session. `page.exposeBinding('__recordAction__', ...)` wired before
  `page.addInitScript(...)`, both before the first navigation (order matters — verified this the
  hard way, see Bugs below). CDP `Page.startScreencast`/`screencastFrame`/`screencastFrameAck`
  for the live view; `Input.dispatchMouseEvent`/`dispatchKeyEvent`/`insertText` for input
  injection back in. No AI anywhere on this path — same deterministic engine as every other
  phase, just driven live instead of by a spec file.
- `server/src/recording/sessionManager.ts` — concurrency cap (3 concurrent sessions), idle
  timeout (5 min of no input → auto-dispose), a stopped-but-never-saved session is kept
  addressable for 10 min (so a late `/save` still works) then swept.
- `server/src/recording/codegen.ts` — `generateTest(name, startUrl, actions)` turns a recorded
  action list into a `.spec.ts` string (using `resilientLocator(...)`, same pattern as
  `self-healing-demo.spec.ts`) + a manifest object, **reusing `scripts/lib/manifest.js`'s
  `codeForEntry`** for the locator source so codegen is byte-for-byte the same function Phase
  2's healing-patch script already uses. Pads with a deliberately-unmatchable filler candidate
  in the rare case an element surfaces fewer than 3 real candidates, so the manifest always
  satisfies `schema.json`'s `fallbacks` minItems:2.
- `server/src/recording/websocketHandler.ts` — the live screencast-out/input-in channel,
  attached to the raw `http.Server` via its `upgrade` event (separate from Express's request
  handling). Wire protocol: `{kind: 'mouse'|'key'|'text', ...}` from client, `{type: 'frame',
  data, width, height}` from server. Auth note documented inline: browsers' native WebSocket API
  can't set an Authorization header, so this trusts possession of the session id (a UUID
  returned only from the already-authenticated `POST /api/recordings`) as the capability —
  acceptable for a single-shared-login internal tool, would need revisiting for anything more
  adversarial.
- `server/src/routes/recordings.ts` — `POST /api/recordings` (start, validates http(s) URL,
  429 on concurrency limit), `POST /api/recordings/:id/stop` (returns recorded actions for
  preview), `POST /api/recordings/:id/save` (codegen → write spec+manifest to disk, 409 if the
  target spec path already exists → register via Phase 4's `testsStore`).
- `server/src/app.ts` now returns `{ app, sessionManager }` instead of a bare `app` (needed so
  `index.ts` can attach the websocket handler to the same session manager instance the REST
  routes use) — updated `server/test/app.test.ts`'s one call site accordingly.
- `server/test/recordings.test.ts` — 4 new `node:test` integration tests: auth gate, URL
  validation, 404s on an unknown session id, and a full record→click→stop→save flow against a
  real headless-Chromium session and a throwaway local fixture server, asserting the written
  spec/manifest are correct (`resilientLocator`, `getByTestId('go-btn')`, manifest shape) and
  that saving a second recording under the same name 409s. All 10 backend tests (Phase 4+6
  combined) green, stable across repeated runs.
- `web/src/pages/RecordPage.tsx` (replaces `RecordStubPage`) — URL form → live `<canvas>`
  streaming decoded JPEG frames from the websocket → mouse events on the canvas translated from
  display coordinates to the recorder's fixed 1280×800 viewport and sent as `mouse` messages; a
  visually-hidden, always-focused `<input>` captures keystrokes (`beforeinput`'s `data` → `text`
  messages for printable characters, `keydown` on Enter/Tab/Backspace/Escape/arrows → `key`
  messages) → Stop → preview list (reusing `formatLocator` from Phase 5) → name + Save → navigate
  to the new test's detail page. `web/vite.config.ts` gained a second proxy entry (`/ws`, with
  `ws: true`) alongside the Phase 5 `/api` one, since websocket upgrades need explicit opt-in.
- **Verified live end-to-end in a real browser** (Playwright MCP driving my own React app, whose
  canvas relays into a *second*, headless Playwright browser server-side — nested automation):
  logged in, started a recording against `https://playwright.dev/`, saw the real page streaming
  live in the canvas, dispatched a synthetic click at the "Get started" link's actual on-canvas
  position, watched the *remote* browser navigate to the Installation page in the live stream,
  clicked Stop and saw the preview correctly show `click role "link" named "Get started"`, named
  and saved it, landed on the new test's detail page, clicked Run, and **the generated test
  passed** — closing the full loop PLAN.md's Phase 6 "done when" describes, plus one step
  further (confirming the generated spec actually executes correctly, not just that it gets
  created). Inspected the written files afterward — clean, idiomatic output indistinguishable
  from a hand-written spec/manifest. Deleted the demo test/spec/manifest afterward (verification
  artifact, not product content).
- `npx tsc --noEmit` (repo root) and `npx tsc -b` (`web/`) both clean; re-ran the existing 4-spec
  Playwright suite on chromium — still 4/4 green, no regression.

## Bugs found and fixed during this session's own testing (not just written and assumed correct)
- **Screencast frames were silently dropped for the very first navigation.** Initial
  implementation called `page.goto()` before `Page.startScreencast` — any repaint from that
  first navigation (often the *only* repaint on a static page) happened before anything was
  listening. Reordered so screencast starts first. Separately, even with that fix, a client
  connecting *after* the route's `POST /api/recordings` handler already returned (the normal
  case — start, then the frontend opens the websocket) could still miss whatever frame arrived
  in that gap. Fixed by having `RecordingSession` buffer the most recent frame and replay it
  immediately to a newly-attached `onFrameReceived` listener. Caught via a standalone
  reproduction script exercising the session class directly with a controlled local HTML
  fixture at known coordinates, not by assuming the CDP wiring "should" work.
- **Websocket message envelope collided with the CDP event's own `type` field.** First draft's
  wire protocol was `{type: 'mouse'|'key'|'text', ...}`, but a mouse message also needs to carry
  the CDP event type (`'mousePressed'`/`'mouseReleased'`) — as a second `type` key on the same
  JSON object, which JSON silently resolves to "last one wins," so the server's `switch
  (message.type)` never matched `'mouse'`. Caught via an integration test sending a real
  websocket message and seeing zero recorded actions; fixed by splitting the envelope
  discriminator (`kind`) from the passed-through CDP event type (`type`), and rewriting the
  frontend's message shapes to match before they were ever exercised against a real client.

## Decisions & deviations from PLAN.md
- **Recorder script is a hand-rolled DOM-event listener + heuristic locator picker, not a hook
  into Playwright's internal (unsupported, undocumented) Recorder class** that `npx playwright
  codegen` itself uses. REQUIREMENTS.md 3.1 says actions are "captured using the same engine
  Playwright Codegen uses today" — read as *the same underlying browser-automation engine*
  (real Playwright browser, CDP, no simulated DOM), not literally Codegen's private recorder
  internals, which aren't a public API and could break across Playwright versions if embedded
  directly. The candidate-locator strategies it picks from (role/testId/css/text/placeholder)
  are the exact same vocabulary as `manifests/schema.json` and `generate-manifest.js`.
- **Generated specs call `resilientLocator(...)` for every element**, not a plain `page.getBy*()`
  call — this is a deliberate strengthening beyond what PLAN.md's Phase 6 bullet explicitly
  asks for ("reusing Phase 1's extraction/generation logic where possible"), chosen because it
  means every recorded test gets Phase 2's deterministic self-healing for free, with real
  fallback candidates already known from record time rather than needing a human to fill in
  `generate-manifest.js`'s `TODO` placeholders afterward.
- **`POST /tests/:id/runs`-style synchronous request/response, applied here too**: `/stop` and
  `/save` are both synchronous REST calls, no job queue — consistent with the Phase 4 decision
  to keep this simple until Phase 7 revisits execution UX at scale.
- **No websocket-level Basic-auth handshake** — documented as a real, accepted tradeoff in
  `websocketHandler.ts` (browsers' `WebSocket` API can't set custom headers); the session id
  itself, mintable only via an authenticated REST call, is the capability. Worth a fresh look if
  this app ever stops being "one shared login behind a trusted network."
- **A click on an input element that's about to be filled gets recorded as its own separate
  `click` action**, distinct from the later `fill` action on the same element (both get their
  own manifest entry/`resilientLocator` call in the generated spec) — real Playwright Codegen
  is smart enough to skip the redundant click when a fill follows on the same locator. Left
  as-is: functionally correct (replays fine, just one extra no-op-ish step), and de-duplicating
  action sequences felt like scope creep for this phase versus a follow-up polish pass.
- **Frame delivery over the websocket is best-effort and can occasionally lag on session start**
  in this sandboxed environment specifically — confirmed via repeated runs that once there's
  real interaction (a user actually moving the mouse/typing, as opposed to a single scripted
  click in a sub-second test window), frames flow reliably. The automated test suite
  (`recordings.test.ts`) deliberately avoids asserting on frame timing for exactly this reason,
  driving input through the session's own API directly instead of over the websocket; the
  websocket/screencast layer itself was verified manually (see above) rather than in the
  automated suite.
- **1280×800 fixed viewport**, no responsive/resizable canvas — the recorder always launches at
  this size and the frontend canvas is sized to match 1:1 for coordinate-mapping simplicity.
  Revisit if recording against a site with meaningfully different real-world viewport
  expectations becomes a problem.

## Open questions for the human
- No automated test drives the frontend `RecordPage` itself (canvas rendering, mouse-coordinate
  translation, hidden-input keystroke capture) — that side was verified manually via the
  Playwright-MCP-driving-my-own-app session described above, not via a repeatable `.spec.ts`.
  Same open question as Phase 5's about frontend test coverage in general, now with more
  surface area.
- Concurrency cap (3) and idle timeout (5 min) are reasonable-guess defaults, not derived from
  any stated requirement — worth revisiting once real usage patterns exist.
- The redundant click-then-fill action pairing (see Decisions) is a known rough edge worth a
  follow-up pass, not a blocker.
- Same root-owned `test-results`/`playwright-report` issue from earlier sessions is still
  unresolved.

---

## Phase 7 session — One-click execution & reporting

## Completed this session
- `server/runner.ts` rewritten: `execFileSync` → async `execFile` (no longer blocks the whole
  Node event loop for up to 120s per run — recording sessions/health checks/other requests were
  previously frozen out for the run's entire duration). Signature changed to
  `runSpec(repoRoot, dataDir, specPath, runId)`; `runId` is minted by the caller (`routes/
  tests.ts`) up front so the artifact directory name and the eventual `runsStore` record share
  the same id, with no separate path field to keep in sync.
- New `playwright.execution.config.ts` (repo root) — used only by app-triggered runs, never
  `npm test`/CI (which keep using `playwright.config.ts` untouched). Forces `trace: 'on'`,
  `video: 'retain-on-failure'`; `outputDir`/report `outputFolder` are read from
  `PW_RUN_OUTPUT_DIR`/`PW_RUN_REPORT_DIR` env vars set per-run by `runner.ts`, pointing at
  `<dataDir>/runs/<runId>/{test-results,report}/` — never the repo-root `test-results/`/
  `playwright-report/` dirs, which sidesteps the recurring root-ownership problem on
  `playwright-report/` (confirmed still `root:root` this session) entirely rather than fixing it.
- `runsStore.ts`: `Run` gained `reportAvailable: boolean` (no path stored — the report dir is
  always `runs/<id>/report/` by construction, so "does `index.html` exist" is the only thing
  worth persisting). `create()` now accepts an optional caller-supplied `id`.
- New `server/src/execution/runManager.ts` — run concurrency cap (`MAX_CONCURRENT_RUNS = 2`),
  same cap-plus-`'CONCURRENCY_LIMIT'`-sentinel-error shape as Phase 6's `sessionManager.ts`, now
  load-bearing where it wasn't before: async `execFile` means nothing else stopped N simultaneous
  `POST /tests/:id/runs` calls from spawning N parallel Chromium processes. Route layer turns the
  sentinel into `429`, same as the recordings route already does for its own cap.
- New `server/src/routes/runReport.ts` — serves each run's self-contained Playwright HTML report
  as static files at `GET /api/runs/:runId/report/*`, mounted in `app.ts` **before**
  `basicAuth`, deliberately unauthenticated (see Decisions below).
- Frontend: `types.ts`/`api.ts` extended (`reportAvailable` field, `getRun()`, `reportUrl()`);
  new `RunDetailPage` at `/tests/:testId/runs/:runId` showing status/stats/healed-locator diffs
  (reusing `StatusLamp`/`formatLocator`/the `PendingFixesPage` diff-card visual pattern) plus an
  `<iframe>` embed of the run's HTML report, or a plain "No report was generated for this run"
  message when `reportAvailable` is false (exercised directly against a real pre-Phase-7 run
  record on disk, which has no `reportAvailable` field at all — `undefined` is falsy, degrades
  cleanly, confirmed in the browser, no crash). `TestDetailPage`'s run-history rows are now links
  to this page instead of plain unclickable divs.
- Verified end-to-end in a real browser (Playwright MCP driving the actual running app, both the
  Express API on `:4000` and Vite dev server, logged in as `admin`/`change-me`): clicked ▶ Run on
  an existing (pre-existing junk) test, watched the button show "Running…" and resolve, opened
  the new run's detail page, and the embedded report iframe rendered a real Playwright HTML
  report — including a working "View video" link (the test failed, so `retain-on-failure` kept
  the video) and a working "View Trace" link that opens Playwright's own trace viewer, itself
  served from the same per-run report directory. All fully in-browser, no CLI, no file access.
- `npx tsc --noEmit` (repo root) and `npx tsc -b` (`web/`) both clean. `npm run test:server`
  (13 tests, including 2 new ones covering the report route's 200/404 cases and 3 new
  `runManager` unit tests) — all passing.

## Decisions & deviations from PLAN.md
- **Report route is unauthenticated**, mounted before `basicAuth` in `app.ts`. A browser
  `<iframe>`/page-load request can't attach a custom `Authorization` header, the same limitation
  Phase 6's `websocketHandler.ts` already hit and documented for the recording websocket. Same
  fix reused here: the run's id (an unguessable UUID, mintable only via an authenticated
  `POST /tests/:id/runs`) is the capability token instead of a header. Same accepted tradeoff as
  Phase 6's — worth a fresh look together if this app ever stops being "one shared login behind
  a trusted network."
- **A separate `playwright.execution.config.ts` rather than parameterizing the base config** —
  trace/video capture is expensive and shouldn't apply to `npm test`/CI, and per-run
  output/report directories need to be app-controlled; keeping it a fully separate, self-
  contained config (own `testDir`/`projects`, not merged/imported from the base config) avoids
  any dependency on Playwright's config-composition API behaving a particular way across
  versions.
- **`runId` generated by the route handler, not by `runsStore.create()`** — `runner.ts` needs a
  run id before the run starts (to name the artifact directory), so `create()` was widened to
  accept an optional caller-supplied `id` rather than always minting its own. Existing callers
  that don't pass one are unaffected.
- **Concurrency cap set to 2**, matching Phase 6's own admission this number is a reasonable
  guess, not derived from any stated requirement or measured resource limit — same caveat
  applies here.
- **No job queue / no async polling UI** — `POST /tests/:id/runs` is still a single blocking
  request/response (now non-blocking for the rest of the server, but the calling browser tab
  still waits for the whole run). Consistent with every prior phase's "keep it simple until
  there's a reason not to" calls (Phase 4's sync REST endpoints, Phase 6's sync `/stop`/`/save`).
  Revisit if run durations or usage patterns make the UI feel unresponsive.
- **No artifact retention policy** — every run's `test-results/`+`report/` directories persist
  under `server/data/runs/<id>/` forever (gitignored, so never committed, but real disk usage on
  whatever host runs this). Flagged rather than solved — see Open questions.

## Open questions for the human
- **Artifact retention/cleanup** — nothing prunes old runs' `test-results/`/`report/` directories.
  Fine for now at this scale/session length, but will grow unbounded in real usage. Needs a
  policy decision (keep last N runs per test? age-based? only prune passing runs' artifacts?)
  before this matters in practice.
- **`main` is 3 phases behind** the actual most-current branch (see Status above) — not something
  this session should resolve unilaterally, flagging for you to decide when/how to catch it up.
- Concurrency cap (2) is a guess, same caveat as Phase 6's session count (3) — both worth
  revisiting together once real usage exists.
- The unauthenticated report route (see Decisions) is the same open tradeoff Phase 6 already
  flagged for its websocket — now two capability-token-style unauthenticated paths exist for the
  same underlying reason. Worth a single combined look if/when auth model changes.

---

## Phase 8 session — In-app healing review queue

## Completed this session
- **Write path**: `pendingFixesStore.ts` gained `recordHealing(testId, events, source)` — turns a
  run's `healingEvents` into one queued `PendingFix` per healed element, skipping any element
  that already has an undecided (`status: 'pending'`) fix queued so a test that keeps healing the
  same element run after run before anyone reviews it doesn't spam duplicates. `routes/tests.ts`
  calls it right after `runsStore.create()` in the run handler, with `source: 'fallback'` (Phase
  2's deterministic fallback chain only — Phase 9 will add `'ai'`). `PendingFix` gained a
  `fallbackIndex` field (from `HealingEvent`) needed for the approve step below.
- **Approve path** (the actual gap Phase 8 exists to close — storage/UI for this already existed
  from Phase 4/5): `routes/pendingFixes.ts` now requires `repoRoot` and, on approve, calls a new
  `applyFixToFiles()` that **reuses `scripts/lib/manifest.js` and `scripts/lib/patch-spec-
  locator.js` as-is** — the exact same manifest-promotion and TS-compiler-API spec-rewrite logic
  `scripts/apply-healing-patches.js` uses for its git-branch flow, per CLAUDE.md's expectation
  that this logic "is expected to be reused as-is or near-as-is; only where the healing event
  gets written changes." Only difference: a direct `fs.writeFileSync` on approve, no branch
  checkout/commit — the end user has no git access at all, so there's nothing to commit to.
  Guards added: re-deciding an already-decided fix returns `409` instead of silently re-applying;
  a fix whose manifest entry is gone (test re-recorded/removed since queued) returns `409` and
  leaves the fix `pending` rather than losing the review. Reject stays a pure status flip, exactly
  as before — nothing on disk changes, matching REQUIREMENTS.md 3.3 step 5 ("rejecting discards
  it and the test keeps failing until someone re-records or otherwise fixes it").
- `createApp()` gained an injectable `runSpec` option (mirroring the existing `sessionManager`
  injection point) purely for testability — lets the healing-to-Pending-Fix wiring be exercised
  end-to-end through real HTTP without spawning a real Playwright process for every test case.
- Frontend: `PendingFix` type gained `fallbackIndex`; `PendingFixesPage` now links each card's
  spec path to the test's detail page (closes the "which test" part of PLAN.md's Phase 8 bullet
  list — the spec path alone didn't let you navigate there before), and surfaces approve/reject
  failures inline (previously a thrown `ApiError` from a 409 would just vanish — reload() and
  refreshCount() silently wouldn't run, no feedback to the user).
- **Verified end-to-end in a real browser**, not just via injected fakes: used the Phase 6
  recorder against `https://playwright.dev/` to generate a real spec + manifest with genuine
  captured fallback candidates, deliberately broke the "Get started" link's primary locator in
  both files (swapped it for a bogus CSS selector, moved the original working `role=link` locator
  into the fallback list), clicked Run — the run came back `Healed`, `1 passed`, `1 locator(s)
  self-healed`. Opened Pending Fixes, saw the real before/after diff (`− css
  ".this-element-does-not-exist"` / `+ role "link" named "Get started"`), clicked Approve, and
  confirmed via direct file reads that the manifest's `primary` and the spec's
  `resilientLocator(...)` call were both rewritten to the healed locator. Ran the test again:
  plain `Passed`, no healing — confirms Approve genuinely changes what the *next* run uses as
  primary, which is PLAN.md's exact "done when" bar for this phase. Deleted the demo test/spec/
  manifest afterward (verification artifact, not product content), same as the Phase 6 session's
  own precedent.
- `npx tsc --noEmit` (repo root) and `npx tsc -b` (`web/`) both clean. `npm run test:server`: 20
  tests passing — added a dedicated `pendingFixesStore.test.ts` (4 tests, pure unit tests for
  `recordHealing`'s dedup logic), a new `healingToPendingFixes.test.ts` (3 tests, HTTP-level via
  the injected fake `runSpec`), and rewrote the old `app.test.ts` "pending fixes" test — it
  previously approved a fix pointing at a nonexistent spec/manifest, which the new file-patching
  approve logic correctly now rejects with `409`; replaced with a real fixture spec+manifest so
  approve's actual file-patching is asserted (manifest `primary`/`fallbacks` reshaped correctly,
  spec's locator expression rewritten), plus new cases for the double-decide and missing-manifest
  `409`s.

## Decisions & deviations from PLAN.md
- **No new branch for this phase** — see Status above; a real, non-cosmetic deviation from the
  "one feature branch per phase" workflow, caused by nothing being committed yet to branch off.
- **`scripts/apply-healing-patches.js` left in place, untouched, as a dev-only tool** rather than
  deleted — PLAN.md explicitly left this as a "decide at the time" call. Nothing in the app calls
  it (never did), so there's no behavior overlap/conflict; it remains usable standalone against
  `test-results/healing-events.jsonl` for anyone still working via the CLI/git path directly.
- **Approve failures are `409`, not `500`** — both "already decided" and "manifest entry missing"
  are treated as conflicts with the fix's current state rather than server errors, since neither
  indicates a bug: they're "someone/something already resolved this" or "the world moved on since
  this was queued."
- **Dedup key for `recordHealing` is `(testId, spec, elementKey)` with `status: 'pending'`** —
  once a fix is approved or rejected, the *next* healing event for that same element queues a
  fresh fix rather than being permanently suppressed. Matches the real lifecycle: rejecting means
  "don't fix it *now*", not "never ask again."

## Open questions for the human
- Same branch/commit question as Status above — your call on whether to split Phase 7/8 onto
  separate branches (requires committing Phase 7 first) or just treat this as one combined chunk
  of work to commit together.
- No audit trail of *who* approved/rejected a fix (single shared login, so "who" is always just
  "the team") or *when* beyond `updatedAt` — fine for v1 per REQUIREMENTS.md's single-shared-login
  scope, flagging in case that changes.
- `main` is now 4 phases behind (Phase 2 tip vs. Phase 4-8 all sitting on feature branches) — same
  open item as Phase 7's, growing.

## Branch
- `feature/deterministic-healing` — stale/redundant; same commit as `main`, safe to delete once
  confirmed.
- `feature/webapp-backend` — stale; behind `feature/webapp-frontend`'s "Phase 4 and 5 done"
  commit, which already includes everything this branch has plus Phase 5. Safe to delete once
  confirmed, or rebase if it was meant to track something separately.
- `feature/webapp-frontend` — Phase 4+5, **committed** (`7077e39` "Phase 4 and 5 done").
- `feature/recording-session` — Phase 6, **committed** (`87197b4` "phase 6 done") — corrects this
  file's earlier note calling it uncommitted. Also still carries the Docker removal from that
  session on top of the same commit, uncommitted.
- `feature/webapp-execution` — Phase 7 **and** Phase 8, committed as `4c48185` "Phase 8 done".
- `feature/ai-healing` — Phase 9 (this session), branched from `feature/webapp-execution`'s tip.
  Ready for review; uncommitted.

---

## Phase 9 session — AI healing escalation

## Completed this session
- Added `@anthropic-ai/sdk` (dependency, `^0.115.0`) — the one new package this phase needed.
- `scripts/lib/dom-context.js` — `extractDomContext(page, opts?)`: the scoped-context extractor
  REQUIREMENTS.md 3.3 step 4 calls for. Runs one `page.evaluate()` against the live page, pulling
  only interactive elements (`a,button,input,select,textarea,[role],[data-testid],label`) capped
  at 40 elements, each pruned to `{tag, attrs, text}` with `attrs` limited to a fixed allow-list
  (id/class/role/name/type/placeholder/aria-label/data-testid/href) and `text` truncated to 80
  chars — never `<script>`/`<style>` contents, never the full page HTML. Output is further capped
  at 6000 chars total as a hard ceiling. Verified via `<3` real headless-Chromium tests
  (`server/test/domContext.test.ts`) that script/style content never leaks and the size cap holds
  even with 500 injected elements.
- `scripts/lib/ai-heal-client.js` — `requestHealedLocator({elementKey, oldPrimary, domContext}, deps?)`:
  the single scoped AI call itself. Sends only the failed locator's old definition + the pruned DOM
  snippet above — never the full page, never secrets/credentials/PII, matching REQUIREMENTS.md 3.3
  step 4 and Section 4's security bullet. Model defaults to `claude-haiku-4-5-20251001`
  (overridable via `AI_HEAL_MODEL`), gated on `ANTHROPIC_API_KEY` (no default — throws immediately
  if unset, caught by the caller as a best-effort miss, not a crash). Response is required to be a
  single bare JSON object matching `manifests/schema.json`'s locator shape (`parseLocatorEntry`,
  also exported standalone for direct unit testing); anything else — non-JSON, an unrecognized
  `strategy`, a `role` locator missing `role`, etc. — throws with the raw response text in the
  error so a human debugging a bad AI response can see exactly what came back. `deps.client` lets
  tests inject a fake Anthropic client instead of hitting the real API, the same injectable-
  dependency pattern `server/src/app.ts` already uses for `runSpec`/`sessionManager`. Token usage
  (`input_tokens`/`output_tokens` from the response) is returned alongside the parsed locator so
  the caller can log/store cost, per Phase 9's "done when" bar.
- `tests/support/resilient-locator.ts`: added step 4 of REQUIREMENTS.md 3.3 after the existing
  fallback loop (steps 1-3, unchanged) — if every manifest fallback also fails, extracts the DOM
  context, calls `requestHealedLocator`, and if the AI's proposed locator actually resolves on the
  live page, logs `[AI-HEALED]` (with token counts) and returns it, healing that specific run's
  result exactly like a fallback heal does. Wrapped in its own try/catch so a missing API key, a
  network error, a malformed AI response, or the AI's candidate still not resolving all fall
  through silently (a `console.warn`, not a crash) to the pre-existing `throw primaryError` — AI
  escalation is additive and best-effort, it never changes how or whether a test fails when it's
  unavailable. The AI client is now referenced as `aiHealClient.<fn>` (module namespace) rather
  than destructured, purely so tests can monkey-patch `aiHealClient.requestHealedLocator` with a
  fake before exercising this file, without needing a real network call or API key.
- `tests/ai-healing-demo.spec.ts` + `manifests/ai-healing-demo.json` — a new worked example,
  deliberately network-free (unlike `self-healing-demo.spec.ts`'s live playwright.dev target): a
  local fixture page whose primary *and* both manifest fallbacks are broken on purpose, so the
  only way through is AI escalation. Two tests: one monkey-patches `aiHealClient.requestHealedLocator`
  to return a correct locator and asserts the healed locator actually resolves and is clickable;
  the other deletes `ANTHROPIC_API_KEY` and asserts the call still fails cleanly with the original
  locator error (no crash, no different failure mode) — this is the realistic CI/default-config
  case, since no API key is configured anywhere in this repo. Both run in the normal `npm test`
  suite alongside the existing 4 specs, need no `ANTHROPIC_API_KEY` to pass, and add no network
  dependency or flakiness.
- **Storage/plumbing to carry AI-sourced heals into Phase 8's Pending Fixes queue**, reusing
  Phase 8's approve/reject mechanism as-is:
  - `server/src/storage/runsStore.ts`'s `HealingEvent` gained `source: 'fallback'|'ai'` (now
    required — every event, fallback or AI, is tagged at the point it's logged in
    `resilient-locator.ts`) and an optional `tokensUsed: {inputTokens, outputTokens}` (AI only).
  - `server/src/storage/pendingFixesStore.ts`'s `PendingFix` gained the matching optional
    `tokensUsed`, threaded through in `recordHealing()`.
  - `server/src/routes/tests.ts`: a single run's `healingEvents` can now legitimately contain both
    `'fallback'` and `'ai'`-sourced events (AI only escalates per-element, after that element's own
    fallback chain is exhausted, so a multi-element test could heal some elements via fallback and
    others via AI in the same run) — split by `event.source` before calling `recordHealing()`
    (once per source) rather than assuming one source for the whole batch, since `recordHealing`'s
    existing signature takes one `source` for the whole array.
  - **No change needed** to `server/src/routes/pendingFixes.ts`'s `applyFixToFiles()` (Phase 8's
    Approve file-patching) — an AI-sourced fix's `fallbackIndex` is logged as `-1` (there's no
    existing manifest fallback slot the AI's locator came from), and the existing
    `entry.fallbacks.filter((_, i) => i !== fix.fallbackIndex)` line already does the right thing
    for a sentinel that never matches a real array index: it keeps every existing fallback
    unchanged and simply prepends the old primary into the fallback pool, exactly like a fallback-
    sourced approve would with one *fewer* fallback removed. Verified by hand (see Decisions) —
    the manifest promotion logic Phase 2/8 already wrote turned out to generalize to Phase 9's case
    for free.
  - Frontend (`web/src/types.ts`, already-existing `PendingFixesPage.tsx`/`RunDetailPage.tsx`):
    `HealingEvent`/`PendingFix` types gained the matching `source`/`tokensUsed` fields.
    `PendingFixesPage.tsx` already branched on `fix.source === 'ai'` to show "AI-healed" vs
    "Fallback-healed" (built ahead of time in Phase 5/8, never previously exercised since nothing
    produced `source: 'ai'` until now) — added a small token-count line under the diff when
    `tokensUsed` is present, satisfying REQUIREMENTS.md 3.4/Phase 9's "token cost visible" bar.
    `RunDetailPage.tsx`'s self-healed-locators list didn't show source at all before this session —
    added the same `StatusLamp` label + token-count line there too, so a run's own report page
    shows AI vs fallback per healed element, not just the Pending Fixes queue.
- Unit tests: `server/test/aiHealClient.test.ts` (8 tests — response parsing for both locator
  shapes, whitespace tolerance, rejection of non-JSON/unrecognized-strategy/missing-field
  responses, the no-API-key/no-injected-client failure, and `parseLocatorEntry` exported
  standalone) and `server/test/domContext.test.ts` (3 tests, real headless Chromium — interactive-
  element filtering, script/style non-leakage, size cap under load) — all mock/self-contained, no
  real Anthropic API calls anywhere in the automated suite. `server/test/healingToPendingFixes.test.ts`
  extended with an AI-sourced-event case and a mixed-fallback-and-ai-in-one-run case (2 new tests);
  its pre-existing fixture event needed a `source: 'fallback'` field added since `HealingEvent`
  now requires it (the route's new source-split logic would otherwise have silently dropped that
  test's event, since it matched neither filter — caught by actually running the suite, not
  assumed safe).
- `npx tsc --noEmit` (repo root) and `npx tsc -b` (`web/`) both clean. `npm run test:server`: 33
  tests passing (20 from Phase 4-8 + 13 new this session). Full Playwright suite on chromium: 6
  passed (the 4 pre-existing specs + this session's 2 new AI-healing-demo tests) — the 3 failures
  `npx playwright test` also reports (`tests/aaa.spec.ts`, `tests/dddd.spec.ts`, `tests/rfff.spec.ts`)
  are pre-existing junk from earlier manual verification against real external sites (Google,
  a shop site), already committed before this session and unrelated to this session's changes —
  confirmed via `git log` that they predate this branch and `git diff` that this session never
  touched them.
- Hand-verified the Approve path's manifest-patching logic for an AI-sourced fix (`fallbackIndex:
  -1`) against a throwaway fixture manifest via a standalone script — confirmed the primary
  becomes the AI locator and the old primary is correctly prepended into `fallbacks` with the
  other fallbacks untouched (see Decisions for the caveat this surfaced).

## Decisions & deviations from PLAN.md
- **Branched from `feature/webapp-execution`'s tip, not `main`** — same reasoning and precedent as
  Phase 7/8 (see their own "Decisions" entries): Phase 9's code depends on Phase 4-8's `server/`
  storage/routes, which only exist on that branch.
- **AI escalation is gated on `ANTHROPIC_API_KEY` with no default/fallback key** — matches
  REQUIREMENTS.md's "no vendor lock-in"/security framing (a model call is opt-in infrastructure,
  not baked in) and means every existing test/demo in this repo keeps working unmodified with zero
  config, since nothing sets that env var. This was deliberately exercised as its own test case
  (`tests/ai-healing-demo.spec.ts`'s second test) rather than left as an assumption.
- **DOM context extraction caps are hand-picked (40 elements, 6000 chars), not derived from a
  token-budget calculation** — a reasonable-guess default in the same spirit as Phase 6/7's
  concurrency-cap/idle-timeout guesses; worth revisiting once real AI-healing usage/cost data
  exists.
- **`fallbackIndex: -1` sentinel for AI-sourced events**, rather than extending the manifest-patch
  logic to handle "this locator has no prior fallback slot" as an explicit case. Chosen because
  the existing `filter((_, i) => i !== fix.fallbackIndex)` already produces the correct result for
  an index that can never match (see Completed above) — reusing it as-is is more in the spirit of
  "Phase 2's resolver logic is expected to be reused as-is or near-as-is" (CLAUDE.md) than adding a
  parallel code path. Flagging the one real edge case this introduces under Open questions below.
- **No CI cost/time separation for AI calls added** — CLAUDE.md's Phase 3-era note that this was
  "deferred until Phase 3 introduces AI calls" now applies to this session, but token cost is
  currently only visible per-fix in the Pending Fixes/run-detail UI, not aggregated anywhere.
  REQUIREMENTS.md/PLAN.md's Phase 11 ("hardening") is where aggregated token/cost logging is
  explicitly scoped — left for that phase rather than added speculatively here.
- Made a small, targeted correction to `CLAUDE.md` (not a new phase's job normally, but directly
  falsified by this session's own work): removed the "Nothing in the codebase calls an AI model
  anywhere yet" line, added a short note on `resilient-locator.ts`'s new step 4, and flagged (but
  did not attempt to fix) that the whole "Architecture" section still only describes Phases 0-2 —
  it was never updated for the Phase 4-9 web-app pivot at all (no mention of `server/`/`web/`
  anywhere in it). Full rewrite felt like scope creep for this session; flagging it explicitly
  instead so it doesn't stay silently wrong.

## Open questions for the human
- **Manifest `fallbacks` can exceed `manifests/schema.json`'s `maxItems: 3`` after approving an
  AI-sourced fix**, if the element already had 3 fallbacks before the AI healed it (old primary +
  3 existing fallbacks = 4). Nothing in the codebase currently validates a manifest against
  `schema.json` at runtime (confirmed — it's `not yet wired into any runtime logic` per CLAUDE.md,
  unchanged by this session), so this doesn't break anything today, but it is a real, now-
  reachable way for a manifest to silently drift out of its own documented schema. Worth deciding
  whether to (a) add runtime schema validation somewhere, (b) cap fallbacks on write (drop the
  oldest), or (c) leave it as documentation-only, same open-ended state as before this session.
- No real end-to-end verification against the actual Anthropic API was possible this session — no
  `ANTHROPIC_API_KEY` is available in this environment. Everything is verified via injected-fake-
  client unit tests (`aiHealClient.test.ts`) and a monkey-patched integration demo
  (`ai-healing-demo.spec.ts`), which prove the plumbing/parsing/wiring end-to-end, but a real
  live call (real Haiku response quality on a real broken locator) has never actually happened.
  Worth a manual dry run with a real key before trusting this in production.
- CLAUDE.md's Architecture section staleness (see Decisions above) is bigger than this phase's
  scope — someone should do a dedicated pass rewriting it to describe `server/`/`web/` and Phases
  4-9, since right now it only documents the pre-pivot CLI engine.
- `main` is now 5 phases behind (`feature/ai-healing` is the most current branch) — same
  recurring open item as every session since Phase 4, now one phase further along.
- Same root-owned `test-results`/`playwright-report` issue from the very first sessions is,
  presumably, still unresolved (not re-checked this session — Phase 9's own new tests write to
  temp dirs/`server/data`, not the repo-root dirs, so it didn't come up).

## Branch
- `feature/ai-healing` — Phase 9 **and** Phase 10 (see next entry), branched from
  `feature/webapp-execution`'s tip (`4c48185`). Ready for review; uncommitted; both phases' file
  changes are currently mixed together in the working tree.

---

## Phase 10 session — Quality add-ons (accessibility + visual regression)

## Completed this session
- Added `@axe-core/playwright` (dependency, `^4.12.1`) — the one new package this phase needed.
- `tests/support/fixtures.ts` — the "base test fixture" PLAN.md's Phase 10 bullet calls for: a
  `test` extended from `@playwright/test`'s, overriding the `page` fixture so that once a test
  body finishes, whatever page state remains gets one `@axe-core/playwright` scan
  (REQUIREMENTS.md 3.7). A violation never fails the test — a target site's own pre-existing
  accessibility issues aren't this framework's to start enforcing — it's purely observational:
  results are attached to the test's Playwright report entry (`accessibility-scan`, trimmed to
  `{url, violations, passes: count, incomplete: count, inapplicable: count}` rather than
  AxeBuilder's raw output, which turned out to be ~2MB *per test* of full rule metadata for every
  check that *passed* — caught by actually inspecting a real report's JSON output, not assumed
  small) plus a report annotation naming which rules failed, if any. Wrapped in try/catch so a
  scan failure (page already closed/navigated during teardown) never changes the actual test's
  pass/fail result. All 5 existing example specs (`smoke`, `theme-toggle`, `search-locators`,
  `self-healing-demo`, `ai-healing-demo`) now import `test`/`expect` from this file instead of
  `@playwright/test` directly, so accessibility scanning is on for the whole existing suite, not
  opt-in per spec — matches "runs on every page under test" in REQUIREMENTS.md 3.7. Verified live
  against playwright.dev via `--reporter=json`: the attachment appears in the run's report data,
  correctly sized (~1.8KB, not ~2MB) after the trim.
- `tests/visual-regression.spec.ts` + baseline
  `tests/visual-regression.spec.ts-snapshots/hero-banner-chromium-linux.png` — Playwright's
  native `toHaveScreenshot()` (REQUIREMENTS.md 3.6) against playwright.dev's hero banner, scoped
  to that one element rather than a full-page shot (an external site's own unrelated content
  shifting — nav, footer, anything ad-adjacent — would otherwise make a full-page baseline noisy
  for reasons that have nothing to do with this framework). Baseline generated via `npx
  playwright test tests/visual-regression.spec.ts --project=chromium --update-snapshots` and
  committed; the update workflow itself is documented in `ARCHITECTURE.md`'s new "Quality
  checks" section, satisfying PLAN.md's "update workflow documented" bullet.
- **No new frontend/backend code for "surfaced in the app's report view"** — Phase 7's
  `RunDetailPage` already embeds each run's full, self-contained Playwright HTML report via
  `<iframe>`, and Playwright's own HTML reporter already renders test attachments (the
  accessibility JSON) and screenshot pass/fail/diff images natively. Confirmed this is genuinely
  sufficient rather than assumed: the `--reporter=json` check above shows the attachment lands on
  the *test result* Phase 7's runner already captures into each run's `report/` directory, so
  nothing about how that report gets served needed to change.
- Left the two untracked, already-present `tests/aaqq.spec.ts` / `manifests/aaqq.json` files
  alone — a real in-app-recorded test (not part of this framework's canonical example specs),
  presumably created by you while trying the app; migrating its import or otherwise touching it
  felt out of scope for a docs/test-infra phase and risked interfering with your own work.
- `npx tsc --noEmit` (repo root) and `npx tsc -b` (`web/`) both clean. `npm run test:server`
  unaffected (still 33/33 — no server code touched this phase). Full Playwright suite on
  chromium: 7 passed (4 pre-existing specs + Phase 9's 2 AI-healing-demo tests + this session's
  new visual-regression test) — the same 4 pre-existing junk-test failures from earlier sessions
  (`aaa`, `aaqq`, `dddd`, `rfff.spec.ts`, all real recordings against real external sites like
  Google/a shop site, all predating or unrelated to this session) are unchanged by this work.
- `ARCHITECTURE.md` (the actual up-to-date "how pieces fit together" doc — `README.md` points
  here, not `CLAUDE.md`) updated with a new "AI escalation (Phase 9)" subsection (carried over
  from last session, written up properly here since it hadn't been documented there yet), a new
  "Execution & reporting (Phase 7)" section, and a new "Quality checks (Phase 10)" section,
  plus the repo-layout list and environment-variable reference extended for all of the above.
  It had drifted stale since Phase 6 (never updated for Phase 7's real config/report route,
  Phase 8's approve-actually-patches-files behavior, or Phase 9) — brought current as part of
  this session rather than left for a dedicated pass, since it was directly relevant to what
  shipped both this session and last. `CLAUDE.md`'s own stale "Architecture" section (flagged
  last session) now points readers at `ARCHITECTURE.md` instead of `PROGRESS.md` for this.

## Decisions & deviations from PLAN.md
- **Accessibility violations don't fail tests** — PLAN.md's Phase 10 bullet just says checks
  should run and results should show up; REQUIREMENTS.md 3.7 says "results shown in the app's
  report view," not "the run fails on any violation." Since every example spec targets an
  external site (playwright.dev) this framework doesn't own, auto-failing on that site's own
  pre-existing a11y issues would make the demo suite red for reasons unrelated to this framework
  — observational-only was the more defensible default. Worth revisiting once a real app-under-
  test exists and the team decides whether a11y should be a hard gate for it.
- **Accessibility scan output is trimmed before attaching**, not AxeBuilder's raw `analyze()`
  result — see Completed above; this is a real bug-shaped finding (not a stylistic choice) caught
  by actually checking attachment size, not assumed reasonable.
- **Visual regression targets one scoped element (the hero banner), not a full page** — a
  deliberate, documented deviation from the most literal reading of `toHaveScreenshot()` demos
  (which are usually full-page), chosen specifically because the target is an external site this
  session doesn't control content changes on.
- **This session's own two doc-file changes went beyond Phase 10's literal scope** (`ARCHITECTURE.md`'s
  Phase 7/8/9 sections predate this phase) — justified the same way last session's `CLAUDE.md`
  patch was: directly relevant, previously flagged as stale, and small relative to the risk of
  leaving the *only* accurate architecture reference silently wrong.

## Open questions for the human
- Same branch/commit question as every session since Phase 7 — your call on whether to split
  Phase 9/10 onto separate branches (requires committing Phase 9 first) or treat this as one
  combined chunk to commit together, same as Phase 7+8 before it.
- `main` is now 6 phases behind (`feature/ai-healing` carries Phase 9+10) — same recurring open
  item, one phase further along again.
- Visual regression baseline is Linux/chromium-specific by filename
  (`hero-banner-chromium-linux.png`) — if CI ever runs on a different OS than this dev sandbox,
  the first run there will need its own baseline generated on that OS, not copied from here.
- No accessibility/visual summary badge was added to the frontend (e.g. a violation count on
  `RunDetailPage` outside of what's inside the embedded report iframe) — Phase 7's iframe already
  shows everything Playwright's own reporter captures, so this was treated as sufficient for
  Phase 10's "done when" bar rather than building a redundant second UI for the same data. Worth
  a fresh look if violation counts ever need to be scannable without opening each run's report.
- `tests/aaqq.spec.ts`/`manifests/aaqq.json` (see Status above) are sitting untracked in the
  working tree — your call on whether to keep, delete, or `git add` them; not touched this
  session.

## Branch
- `feature/ai-healing` — Phase 9 **and** Phase 10 (this session), branched from
  `feature/webapp-execution`'s tip (`4c48185`). Ready for review; uncommitted.
