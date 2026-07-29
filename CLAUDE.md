# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repo currently contains **only planning documents** — no code, no `package.json`, no
Playwright project, and (per the environment) no git repository has been initialized yet.
Phase 0 (scaffolding) has not started. Do not assume any tooling, folder structure, or
commands exist beyond what's described below until they've actually been created.

Read these three files in full before doing any work — they are the spec, not background
reading:

- `REQUIREMENTS.md` — non-negotiable scope and philosophy for the whole project.
- `PLAN.md` — the phased build order, one feature branch per phase.
- `PROGRESS.md` — current state; check this first in any new session before re-reading the
  other two in full.

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

## Architecture (as planned — build incrementally per PLAN.md phases)

- `tests/` — Playwright `.spec.ts` files, recorded via Codegen, structured as Page Objects.
- `manifests/` — one JSON file per spec, keyed by element name, each with a `primary` locator
  plus 2-3 `fallbacks` (role/test-id/CSS). Consulted only on locator failure.
- `scripts/` — tooling such as the manifest-scaffolding script (scans a `.spec.ts` and
  heuristically suggests fallback locators for human review) and the self-healing
  patch/PR mechanism.
- `.github/workflows/` — CI, running inside the same container image used locally (see below),
  with deterministic-run and AI-healing cost/time clearly separated in logs.
- Container: based on `mcr.microsoft.com/playwright`, used both locally (`docker compose run
  tests`) and in CI, so browser/OS versions are pinned identically everywhere. This only fixes
  the execution environment — it must not change any self-healing/manifest/AI logic.

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
