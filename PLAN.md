# Development Plan — AI-Assisted Testing Framework

Reference: see `REQUIREMENTS.md` for scope and non-negotiables. This plan intentionally
groups work into a small number of larger phases rather than many small tickets, so
development doesn't stall on process overhead.

## Workflow (applies to every phase below)

1. Before starting a phase, create a feature branch from the base branch:
   `feature/<phase-slug>` (e.g. `feature/locator-manifest`).
2. Do all work for that phase on the branch. Do not touch the base branch directly.
3. Do not merge or commit to base. When the phase is complete, stop and hand it back for
   review.
4. The human reviews the branch, then commits/merges it themselves.
5. Before moving to the next phase, update `PROGRESS.md` (see template at the end of this
   file) with what was completed, what's pending, and any decisions or deviations from this
   plan.
6. Start the next phase from the (now-updated) base branch, not from the previous feature
   branch.

## Phase 0 — Project scaffolding

**Branch:** `feature/scaffolding`

- Initialize the repo: Playwright + TypeScript config, folder structure
  (`tests/`, `manifests/`, `scripts/`, `.github/workflows/`).
- Base Playwright config (browsers, timeouts, reporter settings).
- `Dockerfile` based on the official `mcr.microsoft.com/playwright` image, with the project
  installed on top so browsers/OS are pinned and identical locally and in CI.
- `docker-compose.yml` (or equivalent) for local dev parity — `docker compose run tests`
  should run the exact same thing CI runs.
- CI workflow updated to run inside the same image (via `container:` in GitHub Actions, or
  by building/running the Dockerfile directly) instead of installing Node/browsers on the
  bare runner.
- `README.md` explaining the repo layout, how to record a test, and how to run the suite
  both via Docker and (optionally) natively for quick local iteration.
- Create `PROGRESS.md` from the template below.

**Done when:** a trivial recorded test runs green in CI inside the container, and a
developer can run the identical test locally with a single `docker compose` command and no
other manual setup.

## Phase 1 — Recording pipeline & locator manifest

**Branch:** `feature/locator-manifest`

- Document the Codegen recording workflow (how to record, where files land, naming
  convention).
- Define the locator manifest JSON schema (one file per spec, keyed by element name, with
  `primary` + `fallbacks`).
- Build a small script that scans a `.spec.ts` file and generates a starter manifest
  (heuristic-based fallback suggestions — role/test-id/CSS), for the human to review and
  adjust rather than trust blindly.
- Record 2–3 real example tests end-to-end to validate the shape of the manifest against
  real locators.

**Done when:** at least one real recorded test has a working manifest file next to it, and
the schema is stable enough that later phases can rely on it.

## Phase 2 — Deterministic self-healing (no AI yet)

**Branch:** `feature/deterministic-healing`

- Build the failure-handling hook: when a test fails on a locator, look up the manifest and
  retry with each fallback in order before failing the test for real.
- If a fallback succeeds, patch the `.spec.ts` file and manifest automatically, and commit
  the change to a dedicated branch (e.g. `auto/healed-<timestamp>`) rather than the running
  feature branch — opened as its own PR for review.
- Add clear CI logging so a fallback-healed run is visibly distinguishable from a normal
  pass or a hard failure.
- Intentionally break a locator in a test example to prove the fallback chain works
  end-to-end.

**Done when:** a deliberately broken locator is healed via fallback with no AI call involved,
and the fix appears as a reviewable PR.

## Phase 3 — AI healing escalation

**Branch:** `feature/ai-healing`

- Only triggered when Phase 2's fallback chain is exhausted and still fails.
- Build the scoped-context extractor: given a failed locator, pull the minimal relevant DOM
  subtree (not the full page) for the prompt.
- Integrate the AI call (Claude Haiku or equivalent low-cost model) with a fixed, narrow
  prompt: old locator + DOM snippet + "return one updated locator, nothing else."
- Apply the same patch-and-PR mechanism as Phase 2's fallback healing — same branch
  convention, same "never auto-merge" rule.
- Add a cost/usage log line per AI call (tokens used, which test, which locator) so spend is
  visible over time.

**Done when:** a locator broken badly enough that no fallback works gets correctly healed by
a single scoped AI call, and the resulting patch is a reviewable PR with visible token usage
logged.

## Phase 4 — Quality add-ons

**Branch:** `feature/quality-checks`

- Add `@axe-core/playwright` accessibility checks to the base test fixture.
- Add Playwright's native `toHaveScreenshot()` baseline screenshots for key pages, with the
  update workflow documented (how to intentionally accept a new baseline).
- Confirm the HTML reporter output is useful as-is; note (don't implement) where something
  like Allure might matter later if volume grows.

**Done when:** accessibility violations and visual diffs show up clearly in the same CI run
as functional tests, with no AI involvement.

## Phase 5 — Hardening & handoff docs

**Branch:** `feature/hardening`

- Review everything sent to the AI model across the project for accidental secrets/PII
  exposure.
- Write a short "how this framework works" doc for a new team member (ties Requirements +
  this Plan + the actual repo structure together in one page).
- Confirm the token/cost logging from Phase 3 is aggregated somewhere readable (even just a
  markdown table updated by CI).

**Done when:** someone unfamiliar with the project could read one doc and understand the
whole self-healing flow without reading the code first.

## Future / deferred (not part of this plan)

Tracked here so they aren't forgotten, not because they're scheduled:
- Drag-and-drop visual test builder.
- Full MCP-driven exploratory testing runs.
- Allure / Percy / BuildPulse / Testcontainers / Pact, if and when scale justifies them.

---

## PROGRESS.md template (create this file in Phase 0)

```markdown
# Progress Log

> Update this file at the end of every work session, before handing back for review.
> A new session should be able to read this file alone and know exactly where things stand.

## Current phase
<!-- e.g. Phase 2 — Deterministic self-healing -->

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
