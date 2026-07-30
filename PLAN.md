# Development Plan — AI-Assisted Web Testing Platform

Reference: see `REQUIREMENTS.md` for scope and non-negotiables. Phases 0-2 below are already
built (CLI/git-based engine — see `PROGRESS.md`). Phases 4+ are the web-platform pivot: planning
only right now, **no code**, per explicit instruction — wait for the go-ahead before starting
Phase 4.

## Workflow (applies to every phase below)

1. Before starting a phase, create a feature branch from the base branch:
   `feature/<phase-slug>` (e.g. `feature/webapp-backend`).
2. Do all work for that phase on the branch. Do not touch the base branch directly.
3. Do not merge or commit to base. When the phase is complete, stop and hand it back for
   review.
4. The human reviews the branch, then commits/merges it themselves.
5. Before moving to the next phase, update `PROGRESS.md` (see template at the end of this
   file) with what was completed, what's pending, and any decisions or deviations from this
   plan.
6. Start the next phase from the (now-updated) base branch, not from the previous feature
   branch.

## Phase 0 — Project scaffolding *(done)*

**Branch:** `feature/scaffolding` (merged)

Playwright + TypeScript project, Docker/CI parity, folder structure, trivial smoke test. See
`PROGRESS.md` for what actually landed.

## Phase 1 — Recording pipeline & locator manifest *(done — CLI-based recording superseded, see note)*

**Branch:** `feature/locator-manifest` (merged)

Formalized the locator manifest schema (`manifests/schema.json`), built
`scripts/generate-manifest.js` (scans a `.spec.ts`/Page Object for locators and scaffolds a
starter manifest with `TODO`-marked fallbacks), and a point-and-click zenity-based recorder
(`scripts/record-test.sh`) as an interim non-CLI recording path.

> **Superseded by this pivot:** the zenity/local-desktop recorder assumed the user has a real
> desktop on the machine running the app. The actual target user is remote-browser-only with no
> local install — Phase 6 replaces the *recording UX* with a server-side streamed browser. The
> manifest schema and `generate-manifest.js`'s locator-extraction logic remain useful internals
> and are expected to be reused, not thrown away.

## Phase 2 — Deterministic self-healing engine *(done — git-PR output superseded, see note)*

**Branch:** `feature/deterministic-healing` (built this session; hand off for review)

Built the failure-handling hook (`tests/support/resilient-locator.ts`): on locator failure, try
each manifest fallback in order before failing the test for real, no AI. Built
`scripts/apply-healing-patches.js`, which patches the manifest + spec and commits the fix to a
local `auto/healed-<timestamp>` git branch (never pushed/PR'd automatically).

> **Superseded by this pivot:** REQUIREMENTS.md's non-negotiable review mechanism is now an
> in-app Pending Fixes queue, not a git branch/PR (the target user has no git access at all).
> Phase 8 replaces `apply-healing-patches.js`'s git-branch mechanism with writing to the app's
> storage instead. The core "try fallbacks in order, no AI" resolver logic in
> `resilient-locator.ts` is retained and expected to be reused as-is or near-as-is.

---

## Phase 3 *(reserved — see Phase 9)*

Originally "AI healing escalation" in the pre-pivot plan. Renumbered to Phase 9 below so it can
build on the in-app Pending Fixes queue (Phase 8) instead of the git-PR mechanism it was
originally scoped against.

---

## Phase 4 — Backend API & storage foundation

**Branch:** `feature/webapp-backend`

- Stand up a backend service (e.g. Node/Express) that wraps the existing engine: endpoints to
  list/create/rename/delete test cases, trigger a run, fetch run results, fetch/update Pending
  Fixes.
- Decide and implement the storage layer the API owns (still plain files on disk managed
  entirely by the service, vs. a lightweight database) — the end user never touches these
  directly either way.
- Single shared login (basic auth or simple session-based login) — no per-tenant accounts.

**Done when:** an authenticated API client can list tests, trigger a run, and read back
structured results, with no direct file or git access required.

## Phase 5 — React frontend shell

**Branch:** `feature/webapp-frontend`

- Login screen, test list view, "New Recording" entry point, per-test detail/history view,
  Pending Fixes review screen.
- Can be built against mocked/static data if Phase 4's API isn't fully ready yet; wire up to the
  real API once both exist.

**Done when:** a user can log in and navigate to every major screen (record / run / report /
pending fixes), even if some are still showing placeholder data.

## Phase 6 — Recording session infrastructure

**Branch:** `feature/recording-session`

- Server-side, per-session Playwright browser (headed) launched on demand; a screencast/
  remote-control bridge (e.g. CDP screencast + input injection over a websocket) so the user's
  own browser shows and controls it live — no extension, no local install.
- Session lifecycle: start, idle timeout, concurrent-session limits, cleanup on disconnect.
- On stop, translate captured actions into a test + companion manifest (reusing Phase 1's
  extraction/generation logic where possible), save via Phase 4's API.

**Done when:** a user can enter a URL in the React app, interact with a live streamed browser,
stop, and see a generated test saved and listed — zero CLI, zero git, zero local install.

## Phase 7 — One-click execution & reporting

**Branch:** `feature/webapp-execution`

- "Run" button per test (or a whole suite) triggers the existing Playwright execution engine
  server-side; results (pass/fail/healed/screenshots/trace) surfaced in the React app.
- Scheduled/nightly full-suite runs via the same engine, independent of user-triggered runs.

**Done when:** a user can click Run and see a report in-browser, matching what the existing
HTML reporter already captures, with no CLI/file access needed.

## Phase 8 — In-app healing review queue *(replaces Phase 2's git-PR flow)*

**Branch:** `feature/inapp-healing-review`

- Deterministic fallback-healing during a run (Phase 2's resolver logic, reused) writes to the
  app's Pending Fixes storage instead of committing to a git branch.
- React "Pending Fixes" screen: before/after locator, which test/element, deterministic vs
  AI-sourced, Approve/Reject actions. Approving updates the test's live manifest for future
  runs; rejecting discards it.
- Retire `scripts/apply-healing-patches.js`'s git-branch mechanism from the end-user product
  once this ships (may keep it as an internal/dev-only tool — decide at the time).

**Done when:** a healed locator from a real run appears in Pending Fixes and clicking Approve
changes what the next run uses as primary — zero git operations involved anywhere in the flow.

## Phase 9 — AI healing escalation *(was Phase 3 pre-pivot)*

**Branch:** `feature/ai-healing`

- Only triggered when Phase 2/8's fallback chain is exhausted and still fails.
- Scoped-context extractor: given a failed locator, pull the minimal relevant DOM subtree (not
  the full page) for the prompt.
- Single AI call (Claude Haiku or equivalent low-cost model): old locator + DOM snippet →
  "return one updated locator, nothing else."
- Surfaces into Phase 8's Pending Fixes queue, marked "AI-healed"; same Approve/Reject flow.
- Log token usage per call (test, locator, tokens) so spend is visible.

**Done when:** a locator broken badly enough that no fallback works gets healed by a single
scoped AI call, appears in Pending Fixes marked AI-healed, with token cost visible — still no
auto-apply without a human clicking Approve.

## Phase 10 — Quality add-ons *(was Phase 4 pre-pivot)*

**Branch:** `feature/quality-checks`

- `@axe-core/playwright` accessibility checks on the base test fixture.
- Playwright's native `toHaveScreenshot()` baselines for key pages, update workflow documented.
- Both surfaced in the app's report view (Phase 7) alongside functional results.

**Done when:** accessibility violations and visual diffs show up in the app's report for a run,
with no AI involvement.

## Phase 11 — Hardening & handoff docs *(was Phase 5 pre-pivot)*

**Branch:** `feature/hardening`

- Review everything sent to the AI model across the project for accidental secrets/PII
  exposure — including the recording session's streamed browser view.
- Write a "how this platform works" doc for a new team member (record → run → report → pending
  fixes → optional AI escalation), covering both the non-technical end-user flow and whoever
  maintains the underlying engine.
- Confirm token/cost logging from Phase 9 is aggregated somewhere readable in the app.

**Done when:** someone unfamiliar with the project could read one doc and understand the whole
platform without reading the code first.

## Future / deferred (not part of this plan)

Tracked here so they aren't forgotten, not because they're scheduled:
- Multi-tenant accounts/orgs/billing.
- Drag-and-drop visual test builder.
- Full MCP-driven exploratory testing runs.
- Allure / Percy / BuildPulse / Testcontainers / Pact, if and when scale justifies them.
- Git-based PR review of healed fixes — deliberately removed by this pivot (Section 5 of
  REQUIREMENTS.md), not just deferred; would need a fresh decision to bring back.

---

## PROGRESS.md template (unchanged)

```markdown
# Progress Log

> Update this file at the end of every work session, before handing back for review.
> A new session should be able to read this file alone and know exactly where things stand.

## Current phase
<!-- e.g. Phase 6 — Recording session infrastructure -->

## Status
<!-- In progress / Blocked / Ready for review -->

## Completed this session
-

## Pending / next steps
-

## Decisions & deviations from PLAN.md
<!-- Anything done differently than planned, and why -->

## Open questions for the human
-

## Branch
<!-- current feature branch name, and whether it's been handed off for review yet -->
```
