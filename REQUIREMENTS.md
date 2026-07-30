# Requirements — AI-Assisted Web Testing Platform

## 1. Purpose

A hosted web application that lets a non-technical user record, manage, execute, and review
Playwright-based end-to-end tests for any target URL, entirely from a browser — no CLI, no git,
no local install. Under the hood it is still a Playwright-based framework where AI is used only
as an exception handler, never as a per-run participant. Simple enough for one engineer to
operate and extend; approachable enough for a non-technical QA/product user to drive day to day.

> **Pivot note:** this supersedes the original CLI/git-based delivery model (Phases 0-2, already
> built — see PROGRESS.md). The underlying execution engine (Playwright + locator manifests +
> deterministic fallback healing) is being kept and wrapped in a web app; the git-PR-based
> recording and healing-review workflow is being replaced, not extended. See PLAN.md for the
> phase-by-phase breakdown of what changes.

## 2. Core philosophy (non-negotiable)

- **Deterministic-first.** Every normal test run, recording session, and fallback locator
  resolution uses zero AI tokens.
- **AI on the failure path only.** A model is called only after a test fails *and* all
  deterministic fallback locators have already been tried and failed.
- **Recorded test + its locator manifest are the source of truth** for what executes — owned
  and versioned by the application itself. The end user never edits these as files; internally
  they remain plain Playwright-shaped test steps + JSON manifest so the engine stays portable
  and inspectable by whoever maintains it.
- **No silent self-modification.** An automatically healed fix — deterministic fallback or
  AI-proposed — is never applied to a test's future runs until a human clicks **Approve** in the
  app's Pending Fixes review screen. (This replaces the original git-branch/PR review mechanism
  — see Section 3.3.)

## 3. Functional requirements

### 3.1 Test authoring (recording)

- User provides a target URL from the web app.
- The app launches a real Playwright browser server-side, scoped to that recording session, and
  streams a live, interactive view of it into the user's own browser (screencast /
  remote-control) — no local install, no browser extension.
- The user clicks/types directly against the streamed view; every action is captured using the
  same engine Playwright Codegen uses today.
- On "Stop Recording", the app generates the test steps + a companion locator manifest (same
  2-3-fallback-per-element shape as today), shows a preview, and the user names/saves it.
- Manual drag-and-drop / block-based visual authoring remains explicitly out of scope (Section
  5) — recording is always driven by real interaction with the real target site, never by
  assembling steps from a palette.

### 3.2 Locator manifest

- Unchanged in shape from the existing framework: each recorded test has 2-3 fallback locator
  strategies per interactive element (role/test-id/CSS/text/label/placeholder).
- Consulted only when a locator fails at runtime — never on a normal passing run.
- Owned by the application's storage layer. The end user never edits this directly; it stays
  plain JSON internally.

### 3.3 Self-healing pipeline

1. Test executes normally — no AI.
2. On locator failure, the runner tries each fallback locator from the manifest in order — no
   AI. (This is the mechanism already built in Phase 2 — see PROGRESS.md.)
3. If a fallback succeeds, the fix (which element, old locator, new locator, deterministic vs
   AI-sourced) is queued in the app's **Pending Fixes** screen — not auto-applied, not a git PR.
   The run that triggered it still uses the healed locator so that specific run doesn't fail.
4. If every fallback fails, a single scoped AI call (Claude Haiku or equivalent low-cost model)
   is made with only the failed locator + a minimal relevant DOM snippet — never the full page,
   never secrets/credentials/PII. Its proposed fix is queued the same way as a successful
   fallback, marked "AI-healed".
5. A human reviews each Pending Fix in the app (before/after locator, which test/element,
   deterministic vs AI-sourced) and clicks **Approve** or **Reject**. Approving makes the fix the
   new primary locator for future runs; rejecting discards it and the test keeps failing until
   someone re-records or otherwise fixes it.

### 3.4 Test execution & reporting

- One-click **Run** on any saved test (or a whole suite) from the web app — no CLI.
- Results (pass/fail/healed, per-browser if applicable, screenshots/trace on failure) are shown
  in the app's own report view, built on the existing Playwright HTML/trace output — always
  viewable in-browser, nothing to download or open locally.
- Scheduled/nightly full-suite runs remain possible via the same execution engine, independent
  of user-triggered one-click runs.

### 3.5 Test management

- List, rename, delete, and re-record test cases from the web app.
- View a test's current locator manifest and Pending Fixes history in the app (read-only
  browsing at minimum for v1; direct editing is a nice-to-have, not required).

### 3.6 Visual regression

- Playwright's native `toHaveScreenshot()` pixel-diff assertions, surfaced in the app's report
  view. No AI involvement. (Unchanged in intent from the original plan — now a later phase; see
  PLAN.md.)

### 3.7 Accessibility

- `@axe-core/playwright` runs on every page under test, results shown in the app's report view.
  Deterministic, no AI.

### 3.8 Reporting

- Playwright's HTML reporter output remains the underlying data source; the app's report view
  is the primary way a user ever looks at it (no external reporting service).

## 4. Non-functional requirements

- **Token budget:** unchanged — AI is never invoked on a passing run; failure-path AI calls stay
  scoped to a single locator + DOM subtree.
- **Auditability:** every healed fix (deterministic or AI) is visible in the in-app Pending
  Fixes / history log with a clear "AI-healed" vs "fallback-healed" marker — this **replaces**
  the git-PR-based audit trail from the original design.
- **No vendor lock-in:** the execution engine stays plain Playwright; only the storage/review
  layer changes from git-files-and-PRs to app-owned storage and an in-app queue.
- **Access:** a single shared login for the team for v1 — no per-tenant account isolation, no
  billing (see Section 5 for what's deferred).
- **Security:** no secrets/credentials/PII are ever sent to the AI model. The recording
  session's streamed browser view must not leak the operator's own credentials/session into
  anything persisted or sent to a model.
- **Consistent execution environment:** test *execution* (scheduled/one-click runs) and the
  *recording session's* browser both run against the exact `@playwright/test` version pinned in
  `package.json`, with browsers installed fresh via `npx playwright install --with-deps` — the
  same command locally, in CI, and on whatever host runs the backend. No Docker/container
  pinning as of this pivot (removed — see PROGRESS.md); consistency comes from the pinned npm
  version instead.

## 5. Explicitly out of scope (for now)

- Multi-tenant accounts/orgs/billing (single shared login only, per this pivot's decision).
- Drag-and-drop / block-based visual test builder (recording is always via real browser
  interaction, never a palette).
- Full Playwright MCP server wired into CI.
- Allure, Percy/Applitools, BuildPulse, Testcontainers, Pact, playwright-bdd.
- Auto-merge/auto-apply of any AI-generated **or** deterministically-healed fix without an
  explicit human Approve click in the app.
- Git-based PR review of healed fixes — **explicitly removed by this pivot**, superseded by the
  in-app Pending Fixes queue (Section 3.3). The git-branch/commit mechanism already built in
  Phase 2 (`scripts/apply-healing-patches.js`) is retained only as an internal/dev-only tool
  until Phase 8 replaces it, not as part of the end-user-facing product.

These may be revisited once the platform is stable — see PLAN.md for how they might slot in
later.

## 6. Development process requirements (for building this platform itself)

- Unchanged from before — this governs how *this codebase* gets built, not anything the web
  app's end user ever sees or touches:
  - All feature work happens on a feature branch cut from the base branch (e.g. `main`).
  - AI (this assistant) does not commit to or merge into the base branch under any
    circumstance, and does not commit at all unless explicitly asked to in a given session.
  - Each feature branch is completed, self-tested where possible, and left for human review.
  - The human reviews, then commits/merges manually — a manual gate, not automated.
  - `PROGRESS.md` is kept current at the end of each work session.
