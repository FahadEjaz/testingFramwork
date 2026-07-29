# Progress Log

> Update this file at the end of every work session, before handing back for review.
> A new session should be able to read this file alone and know exactly where things stand —
> check here before re-reading REQUIREMENTS.md or PLAN.md in full.

## Current phase
Phase 0 — Project scaffolding

## Status
Ready for review — `docker compose run --rm tests` builds green and all 3 browser projects
(chromium/firefox/webkit) pass the smoke test inside the container.

## Completed this session
- Initialized git repo (`main` as base branch), committed planning docs.
- Created `feature/scaffolding` branch (all work below is on this branch).
- Playwright + TypeScript project: `package.json` (Playwright pinned to `1.62.0` to match the
  Docker image tag exactly), `tsconfig.json`, `playwright.config.ts` (chromium/firefox/webkit
  projects, HTML+list reporters, `BASE_URL` from env).
- Folder structure: `tests/`, `tests/pages/`, `manifests/`, `scripts/` (empty for now),
  `.github/workflows/`.
- Trivial recorded-style smoke test (`tests/smoke.spec.ts`) using a Page Object
  (`tests/pages/PlaywrightHomePage.ts`) against playwright.dev, since no real app under test
  exists yet. Verified green locally on chromium (`npx playwright test`).
- Companion locator manifest stub (`manifests/smoke.json`) — shape only, not yet consulted by
  any runtime logic (that's Phase 2).
- `Dockerfile` (based on `mcr.microsoft.com/playwright:v1.62.0-jammy`) and `docker-compose.yml`
  (`docker compose run --rm tests`).
- CI workflow (`.github/workflows/tests.yml`): runs in the same container image, triggered on
  PRs + nightly cron, uploads the HTML report as an artifact.
- `README.md`: repo layout, how to record a test, how to run the suite via Docker and natively.
- Updated `CLAUDE.md` to reflect that scaffolding now exists (previously said the repo was
  empty).

## Pending / next steps
- Hand off `feature/scaffolding` for human review (CI workflow itself hasn't run in real
  GitHub Actions yet — only the equivalent local Docker run has been verified).
- Start Phase 1 (locator manifest schema + scaffolding script) only after this branch is
  reviewed/merged.

## Notes
- Firefox/webkit couldn't be validated natively in this dev sandbox (no sudo for OS deps) —
  only chromium ran locally outside Docker. All 3 browsers were confirmed passing inside the
  Docker container, which is the environment that actually matters per the "consistent
  execution environment" requirement.

## Decisions & deviations from PLAN.md
- Pinned `@playwright/test` to an exact version (`1.62.0`) rather than a caret range, and
  matched the Dockerfile tag to it exactly — avoids browser/library version drift between
  `npm install` and the container image, which the "consistent execution environment"
  requirement depends on. Keep these two in lockstep on future bumps.
- Smoke test targets `https://playwright.dev` (external, no app under test yet) purely to
  prove the pipeline end-to-end per Phase 0's "done when" criterion. Replace with a real app
  test once one exists.
- Locator manifest schema in `manifests/smoke.json` is a first guess, not finalized — Phase 1
  owns getting the schema right.

## Open questions for the human
- What is the actual app under test (repo/URL) for real recorded tests in Phase 1?
- Any preference on Node version pinning in the Dockerfile beyond what
  `mcr.microsoft.com/playwright:v1.62.0-jammy` ships with?

## Branch
- `feature/scaffolding` — ready to hand off for review.
