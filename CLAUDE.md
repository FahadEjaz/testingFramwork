# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**Major pivot (see REQUIREMENTS.md/PLAN.md):** the product is moving from a CLI/git-based
framework to a hosted React web app — record/run/manage tests and review self-healing fixes
entirely from a browser, no CLI, no git, for a non-technical end user. This pivot is
**planning/docs only so far — no code has been written for it.** Do not start implementing
Phase 4+ (web backend/frontend/recording-session infra) until explicitly told to; the user
asked for the planning docs first and will request code separately.

Phases 0-2 (below) are the already-built CLI/git-based engine. They are being **kept and
reused as internals**, not deleted — but two user-facing parts are already known to be
superseded and will be replaced, not extended, once Phase 4+ starts:
- Phase 1's zenity/local-desktop recorder (`scripts/record-test.sh`) assumed a real desktop on
  the machine running the app; the actual target user is remote-browser-only. Phase 6 replaces
  the recording UX with a server-side streamed browser. Phase 1's manifest schema and
  `generate-manifest.js` extraction logic are expected to be reused.
- Phase 2's git-branch/PR healing review (`scripts/apply-healing-patches.js`) is being replaced
  by an in-app Pending Fixes approve/reject queue (Phase 8) — the target user has no git access
  at all. Phase 2's fallback-resolver logic (`tests/support/resilient-locator.ts`) is expected
  to be reused as-is or near-as-is; only where the healing event gets written changes.

Phase 0 (scaffolding) and Phase 1 (recording pipeline & locator manifest) are merged into
`main`. Phase 2 (deterministic self-healing) was built this session on
`feature/deterministic-healing` and is ready for review (not yet merged) — see PROGRESS.md.
Check `PROGRESS.md` first in any new session for exact current state before re-reading
`REQUIREMENTS.md`/`PLAN.md` in full — both were substantially rewritten for this pivot.

Read these three files in full before doing any work on a new phase — they are the spec, not
background reading:

- `REQUIREMENTS.md` — non-negotiable scope and philosophy for the whole project.
- `PLAN.md` — the phased build order, one feature branch per phase.
- `PROGRESS.md` — current state; check this first in any new session before re-reading the
  other two in full.

## Commands

```bash
# Run the suite (same command locally and in CI)
npm install
npx playwright install --with-deps
npm test                       # all projects (chromium/firefox/webkit)
npx playwright test --project=chromium   # single browser
npx playwright test tests/smoke.spec.ts  # single file
npm run test:ui                # Playwright UI mode
npm run test:headed            # headed browser
npm run report                 # open last HTML report

# Record a new test — point-and-click (no CLI knowledge needed)
scripts/record-test.sh          # double-click, or run directly; needs zenity

# Record a new test — developer/CLI path
npx playwright codegen <url> --output tests/<name>.spec.ts
node scripts/generate-manifest.js tests/<name>.spec.ts

# After a run that self-healed a locator, patch + commit the fix to its own branch
node scripts/apply-healing-patches.js
```

There is no separate lint/typecheck script yet; `tsc` types are enforced implicitly by
`ts-node`/Playwright's TS loader at test-run time. `BASE_URL` env var is unset by default — all
example specs (`tests/smoke.spec.ts`, `tests/theme-toggle.spec.ts`,
`tests/search-locators.spec.ts`) target playwright.dev directly since no real app under test is
wired up yet. `ANTHROPIC_API_KEY` (required) and `AI_HEAL_MODEL` (optional, defaults to
`claude-haiku-4-5-20251001`) gate Phase 9's AI healing escalation — unset in dev/CI by default,
so that failure path is a no-op (falls straight through to the original test failure) unless
explicitly configured.

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

Existing (Phase 0 + Phase 1 + Phase 2):

- `tests/` — Playwright `.spec.ts` files. `tests/smoke.spec.ts` uses a Page Object
  (`tests/pages/PlaywrightHomePage.ts`); `tests/theme-toggle.spec.ts` and
  `tests/search-locators.spec.ts` use raw inline locators (no Page Object required — the
  generator supports both styles). All three target playwright.dev.
- `manifests/schema.json` — formal JSON Schema for the manifest shape: a locator entry is
  `{ strategy: "role", role, name? }` or `{ strategy: "testId"|"css"|"text"|"label"|
  "placeholder", value }`, 1:1 with Playwright's `getBy*`/`locator` methods. Each element needs
  2-3 fallbacks. `manifests/<spec-name>.json` — one per spec, keyed by element name. Consulted
  only on locator failure; not yet wired into any runtime logic (that's Phase 2).
- `scripts/lib/extract-locators.js` — TypeScript-compiler-API-based scanner for
  `page.getBy*()`/`page.locator()`/`this.page.getBy*()` calls.
- `scripts/generate-manifest.js <spec.ts> [--force]` — scaffolds a manifest from a spec (+ any
  Page Object it imports). Fallback locators it emits are `TODO`-marked placeholders, never
  fabricated-looking guesses — no live DOM access on this path, so a human must fill in real
  values before Phase 2+ relies on them.
- `scripts/record-test.js` + `scripts/record-test.sh` — point-and-click recorder for
  non-developers: zenity pop-ups for URL + test name, runs Codegen with `--output`, then
  auto-runs `generate-manifest.js` on the result. Requires a Linux desktop with `zenity`.
- `tests/support/resilient-locator.ts` — `resilientLocator(page, spec, elementKey,
  primaryFactory)`. Manifest is untouched on the normal path; only read after the primary
  locator fails, then each fallback is tried in order (no AI). Logs `[SELF-HEALED]` and appends
  to `test-results/healing-events.jsonl` (`HEALING_LOG_PATH` env var overrides the path) on
  success. If every fallback also fails, falls through to Phase 9's AI escalation
  (`scripts/lib/dom-context.js`'s `extractDomContext` + `scripts/lib/ai-heal-client.js`'s
  `requestHealedLocator`, a single scoped Claude Haiku call gated on `ANTHROPIC_API_KEY` —
  logs `[AI-HEALED]` on success) before rethrowing the original error as a last resort. Both
  paths tag their `healing-events.jsonl` entry with `source: 'fallback'|'ai'`; AI events also
  carry `tokensUsed`.
- `scripts/apply-healing-patches.js` — reads `healing-events.jsonl`, patches the manifest
  (promotes the working fallback to `primary`) and the `.spec.ts` (via
  `scripts/lib/patch-spec-locator.js`, a TS-compiler-API-based rewrite of just the
  `resilientLocator(...)` call's locator expression) for each healed element, then commits both
  to a local `auto/healed-<timestamp>` branch and switches back — never pushes, never opens a
  PR. Refuses to run if the target spec/manifest aren't already committed and clean (patching
  an untracked file and switching branches would make it vanish from the working tree).
- `.github/workflows/tests.yml` — CI, installing Playwright's browsers fresh on the GitHub
  Actions runner (no Docker — `npx playwright install --with-deps`, same command as local),
  triggered on PRs + nightly cron. AI-healing cost/time separation in logs is deferred until
  Phase 3 introduces AI calls.
- `playwright.config.ts` — three browser projects (chromium/firefox/webkit), HTML + list
  reporters, `BASE_URL` read from env (unset for now).

Not yet built (later phases per PLAN.md) — do not assume these exist:

- Automatic `git push`/PR creation for a healed branch — `apply-healing-patches.js` stops at a
  local commit by design; pushing/opening the PR is a documented manual (or future CI) step.
- `@axe-core/playwright` accessibility checks and `toHaveScreenshot()` baselines (Phase 10).

> This "Architecture" section still only describes Phases 0-2 (the CLI/git engine) — it has not
> been updated for the `server/`+`web/` web-app pivot (Phases 4-10, all built). `ARCHITECTURE.md`
> (repo root) is the up-to-date reference for `server/`/`web/` — read that instead of this
> section until this one is rewritten to match.

Self-healing pipeline, in order, per REQUIREMENTS.md 3.3 (steps 1-3 implemented in Phase 2,
step 4 in Phase 9):
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
