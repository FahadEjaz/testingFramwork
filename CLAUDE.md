# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Phase 0 (scaffolding) is in progress on `feature/scaffolding`. Playwright + TypeScript project,
Docker/CI setup, and a trivial smoke test now exist (see "Commands" and "Architecture" below).
Later phases (locator manifest schema, deterministic healing, AI healing, quality add-ons,
hardening) have not started — don't assume anything from those phases exists until it's
actually been built. Check `PROGRESS.md` first in any new session for exact current state
before re-reading `REQUIREMENTS.md`/`PLAN.md` in full.

Read these three files in full before doing any work on a new phase — they are the spec, not
background reading:

- `REQUIREMENTS.md` — non-negotiable scope and philosophy for the whole project.
- `PLAN.md` — the phased build order, one feature branch per phase.
- `PROGRESS.md` — current state; check this first in any new session before re-reading the
  other two in full.

## Commands

```bash
# Run the suite via Docker (matches CI exactly — preferred)
docker compose run --rm tests

# Native local run (faster iteration; requires local browsers)
npm install
npx playwright install --with-deps
npm test                       # all projects (chromium/firefox/webkit)
npx playwright test --project=chromium   # single browser
npx playwright test tests/smoke.spec.ts  # single file
npm run test:ui                # Playwright UI mode
npm run test:headed            # headed browser
npm run report                 # open last HTML report

# Record a new test
npx playwright codegen <url>
```

There is no separate lint/typecheck script yet; `tsc` types are enforced implicitly by
`ts-node`/Playwright's TS loader at test-run time. `BASE_URL` env var is unset by default — the
Phase 0 smoke test targets an absolute URL directly since no real app under test is wired up
yet.

## Core philosophy (from REQUIREMENTS.md — non-negotiable)

This is a Playwright E2E framework where **AI is an exception handler, not a per-run
participant**:

- **Deterministic-first.** Every normal test run (recording, execution, fallback locator
  resolution) uses zero AI tokens.
- **AI on the failure path only.** A model is called only after a test fails *and* every
  deterministic fallback locator in the manifest has already been tried and failed.
- **Script is the source of truth.** The `.spec.ts` file is what runs in CI and what gets
  reviewed in PRs. The locator manifest JSON is metadata only, never the executable artifact,
  and is read only when a locator fails at runtime — never during a normal passing run.
- **No silent self-modification.** AI-proposed fixes are never merged automatically. They land
  as a diff on a review branch/PR for a human to review, with a clear "AI-healed" marker in the
  commit message.
- When an AI call is made on the failure path, it gets only the failed locator + a minimal
  relevant DOM subtree — never the full page, never secrets/credentials/PII.

## Development workflow (applies to every phase in PLAN.md)

1. Before starting a phase, create a feature branch from the base branch:
   `feature/<phase-slug>` (e.g. `feature/locator-manifest`). Self-healing patches go on their
   own branch instead, e.g. `auto/healed-<timestamp>`.
2. Do all work for a phase on its branch. **Never commit or merge to the base branch** — that
   includes AI-authored healing patches, which always land as their own PR.
3. When a phase is complete, stop and hand it back for human review instead of continuing to
   the next phase automatically.
4. Before moving to the next phase, update `PROGRESS.md` using the template at the bottom of
   `PLAN.md` — completed work, pending steps, decisions/deviations, open questions, and current
   branch name.
5. Start the next phase from the (now-updated) base branch, not from the previous feature
   branch.

## Architecture

Existing (Phase 0):

- `tests/` — Playwright `.spec.ts` files, recorded via Codegen, structured as Page Objects
  under `tests/pages/` (see `tests/pages/PlaywrightHomePage.ts` + `tests/smoke.spec.ts`).
- `manifests/` — one JSON file per spec, keyed by element name, each with a `primary` locator
  plus 2-3 `fallbacks` (role/test-id/CSS). Consulted only on locator failure; not yet wired
  into any runtime logic (that's Phase 2). Schema in `manifests/smoke.json` is provisional
  until Phase 1 formalizes it.
- `.github/workflows/tests.yml` — CI, running inside the same container image used locally,
  triggered on PRs + nightly cron. AI-healing cost/time separation in logs is deferred until
  Phase 3 introduces AI calls.
- `Dockerfile` / `docker-compose.yml` — based on `mcr.microsoft.com/playwright`, pinned to the
  exact version installed in `package.json` (keep these two in lockstep when bumping
  Playwright). `docker compose run --rm tests` locally runs the same image/command as CI.
- `playwright.config.ts` — three browser projects (chromium/firefox/webkit), HTML + list
  reporters, `BASE_URL` read from env (unset for now).

Not yet built (later phases per PLAN.md) — do not assume these exist:

- `scripts/` — currently empty; will hold the manifest-scaffolding script (scans a `.spec.ts`
  and heuristically suggests fallback locators) and the self-healing patch/PR mechanism.
- Any locator-failure retry logic, self-healing, or AI escalation (Phases 2-3).
- `@axe-core/playwright` accessibility checks and `toHaveScreenshot()` baselines (Phase 4).

Self-healing pipeline, in order, per REQUIREMENTS.md 3.3:
1. Test runs normally — no AI.
2. On locator failure, try each manifest fallback in order — no AI.
3. If a fallback works, auto-patch the `.spec.ts` + manifest and open a PR on a dedicated
   branch — not merged automatically.
4. Only if every fallback fails: one scoped AI call (Claude Haiku or equivalent low-cost model)
   with the failed locator + minimal DOM snippet, returning one updated locator. Applied via the
   same patch-and-PR mechanism, plus a logged line of token usage per call.

## Explicitly out of scope for now

Drag-and-drop visual test builder, full MCP-driven exploratory runs, Allure/Percy/Applitools/
BuildPulse/Testcontainers/Pact/playwright-bdd, and any form of auto-merge for AI-generated
changes. These are tracked in PLAN.md's "Future / deferred" section, not scheduled.
