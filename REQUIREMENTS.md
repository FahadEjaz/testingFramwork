# Requirements — AI-Assisted Testing Framework

## 1. Purpose

A Playwright-based end-to-end testing framework for a greenfield web app, where AI is used
only as an exception handler — not as a per-run participant. The framework must stay simple
enough for one engineer to fully understand, and professional enough to hand to a team.

## 2. Core philosophy (non-negotiable)

- **Deterministic-first.** Every normal test run (recording, execution, fallback locator
  resolution) uses zero AI tokens.
- **AI on the failure path only.** A model is called only after a test fails *and* all
  deterministic fallback locators have already been tried and failed.
- **Script is the source of truth.** The `.spec.ts` file is what runs in CI and what gets
  reviewed in PRs. Any supporting JSON (locator manifest) is metadata, never the executable
  artifact.
- **No silent self-modification.** AI-proposed fixes are never merged automatically. They land
  as a diff on a branch/PR for a human to review.

## 3. Functional requirements

### 3.1 Test authoring
- Tests are recorded using Playwright Codegen and saved as standard `.spec.ts` files.
- Tests follow a Page Object Model structure for maintainability.
- Manual/drag-and-drop visual authoring is **out of scope** for this phase (see Section 5).

### 3.2 Locator manifest
- Each recorded test has a companion JSON file capturing 2–3 fallback locator strategies per
  interactive element (e.g. role, test-id, CSS).
- The manifest is consulted only when a locator fails at runtime — it is never read during a
  normal passing run.

### 3.3 Self-healing pipeline
1. Test executes normally (no AI).
2. On locator failure, the runner tries each fallback locator from the manifest in order
   (no AI).
3. If a fallback succeeds, the `.spec.ts` file and manifest are patched automatically and
   committed to a review branch — not merged automatically.
4. If all fallbacks fail, a single scoped AI call is made (model: Claude Haiku or equivalent
   low-cost model) with only the failed locator + a minimal relevant DOM snippet — never the
   full page.
5. The AI's proposed locator is applied the same way as a successful fallback: patched into
   the script/manifest on a branch, opened as a PR, never auto-merged.

### 3.4 CI integration
- Tests run in CI on every PR and on a schedule (nightly full suite).
- CI must clearly separate "deterministic run" cost/time from "AI healing" cost/time in logs,
  so token spend is visible and auditable.

### 3.5 Visual regression
- Use Playwright's native `toHaveScreenshot()` pixel-diff assertions.
- No AI involvement in this phase. Escalate to an AI vision check only if a specific diff is
  flagged as ambiguous by a human (not automatic).

### 3.6 Accessibility
- `@axe-core/playwright` runs on every page under test. Deterministic, no AI.

### 3.7 Reporting
- Playwright's built-in HTML reporter is the baseline. No external reporting service in this
  phase.

## 4. Non-functional requirements

- **Token budget:** AI must not be invoked on any passing run. Failure-path AI calls must use
  scoped, minimal context (single locator + DOM subtree, not full page/log).
- **Auditability:** every AI-authored change is a visible diff on a PR with a clear "AI-healed"
  label/marker in the commit message.
- **No vendor lock-in:** no proprietary test format; everything is plain Playwright + JSON +
  git.
- **Portability:** framework must not assume a specific CI provider beyond standard
  YAML-based config (GitHub Actions assumed as default, but not hard-coded elsewhere).
- **Consistent execution environment:** tests run inside a container based on the official
  `mcr.microsoft.com/playwright` image, both locally and in CI, so browser/OS versions are
  pinned and identical across every environment. This is an execution-environment concern
  only — it does not change any self-healing, manifest, or AI-escalation logic above.
- **Security:** no secrets, credentials, or PII are ever included in content sent to the AI
  model.

## 5. Explicitly out of scope (this phase)

- Drag-and-drop / block-based visual test builder.
- Full Playwright MCP server wired into CI.
- Allure, Percy/Applitools, BuildPulse, Testcontainers, Pact, playwright-bdd.
- Auto-merge of any AI-generated change.

These may be revisited once the core framework is stable — see PLAN.md for how they might
slot in later.

## 6. Development process requirements

- All feature work happens on a feature branch cut from the base branch (e.g. `main`).
- AI does not commit to or merge into the base branch under any circumstance.
- Each feature branch is completed, self-tested where possible, and left for human review.
- The human reviews, then commits/merges manually — this is a manual gate, not automated.
- A running progress log (`PROGRESS.md`) is updated at the end of each work session so a new
  session (potentially a new context window) can resume with full awareness of what's done,
  what's in progress, and what decisions were already made.
