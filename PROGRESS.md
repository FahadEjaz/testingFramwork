# Progress Log

> Update this file at the end of every work session, before handing back for review.
> A new session should be able to read this file alone and know exactly where things stand —
> check here before re-reading REQUIREMENTS.md or PLAN.md in full.

## Current phase
Phase 1 — Recording pipeline & locator manifest

## Status
Ready for review — schema formalized, generator script scaffolds real manifests from either
Page Object or raw-inline specs, and 3 example tests (1 carried over + 2 new) pass green
against real DOM on chromium.

## Completed this session
- Merged `feature/scaffolding` into `main` (Phase 0 sign-off — done before this phase started).
- Formalized the locator manifest schema: `manifests/schema.json` (JSON Schema, draft
  2020-12). A locator entry is a discriminated union — `{ strategy: "role", role, name? }` or
  `{ strategy: "testId"|"css"|"text"|"label"|"placeholder", value }` — matching the actual
  Playwright locator methods 1:1 (`getByRole`/`getByTestId`/`getByText`/`getByLabel`/
  `getByPlaceholder`/`locator`). Each element requires 2-3 fallbacks.
- `scripts/lib/extract-locators.js` + `scripts/generate-manifest.js`: scans a `.spec.ts` (and
  any Page Object it imports from `./pages/`) via the TypeScript compiler API for
  `page.getBy*()`/`page.locator()`/`this.page.getBy*()` calls, derives an element name from the
  assigned variable/property (or a heuristic slug from the accessible name/value when the
  locator is inline with no variable), and writes `manifests/<spec-name>.json`. Fallback
  locators it can't verify (no live DOM access) are explicit `TODO` placeholders, not
  fabricated-looking guesses — human review before Phase 2+ relies on them.
- Recording workflow pivoted mid-session at the user's request: the primary recording path is
  now a point-and-click launcher (`scripts/record-test.sh` → `scripts/record-test.js`), not a
  typed CLI command. It uses `zenity` for two plain-English pop-up prompts (URL, test name),
  runs Codegen with `--output` to save directly to `tests/<name>.spec.ts`, then automatically
  invokes `generate-manifest.js` on the result. The `npx playwright codegen <url>` CLI path is
  kept and documented as the developer-facing alternative.
- Regenerated `manifests/smoke.json` via the new script (`--force`) — output matches the
  original hand-written shape exactly (`getStartedLink`/`heading` keys, correct role+name),
  validating the generator against the one existing recorded test.
- Two new hand-authored recorded-style tests (agent has no hands to click through Codegen's
  interactive browser, so these mimic Codegen's raw-inline-locator output; locators were
  ground-truthed against the live site via browser automation before writing, not guessed):
  - `tests/theme-toggle.spec.ts` — nav bar dark/light toggle; stresses a role locator whose
    accessible name changes after interaction.
  - `tests/search-locators.spec.ts` — DocSearch modal; stresses button/searchbox/link/heading
    role locators and a manifest key collision (link + heading both named "Locators" → dedup to
    `locators`/`locators2`).
  - Manifests generated for both (`manifests/theme-toggle.json`, `manifests/search-locators.json`).
  - All 3 specs verified green: `npx playwright test tests/theme-toggle.spec.ts
    tests/search-locators.spec.ts tests/smoke.spec.ts --project=chromium`.
- `package.json`: added `npm run record` (→ `record-test.js`) and `npm run manifest:generate`
  (→ `generate-manifest.js <spec>`).
- `README.md`: point-and-click recording workflow, terminal alternative, and a new "Locator
  manifests" section documenting the schema/generator.

## Pending / next steps
- Hand off `feature/locator-manifest` for human review.
- A human (with a real desktop) should actually double-click `scripts/record-test.sh` at least
  once to confirm the zenity dialogs and Codegen handoff behave as expected end-to-end — this
  session could only syntax-check the script and validate its `codegen`/`generate-manifest.js`
  pieces individually, not the full interactive click-through (no GUI hands available here).
- Firefox/webkit not re-verified this session (only chromium, natively, to keep iteration
  fast) — full 3-browser pass should happen in Docker before/at merge, same as Phase 0.
- Fill in the `TODO` fallback locators across all 3 manifests with real test-id/CSS values
  before Phase 2 (deterministic self-healing) starts relying on them.
- Start Phase 2 only after this branch is reviewed/merged into `main`.

## Decisions & deviations from PLAN.md
- Recording workflow is a GUI launcher (zenity pop-ups + Codegen), not the CLI-only workflow
  PLAN.md originally implied — changed mid-session per explicit user request: target users are
  laymen, not developers, and no CLI syntax should be required to record a test. The CLI path
  (`npx playwright codegen`) is retained as a documented developer fallback and is what
  `record-test.js` calls under the hood.
- `generate-manifest.js` scans raw inline locators as well as Page Object constructors, wider
  than PLAN.md's literal phrasing ("scans a .spec.ts file") — necessary because the new
  recording flow no longer requires a Page Object to exist before a manifest can be scaffolded.
- Fallback locators are explicit `TODO` placeholders rather than plausible-looking guessed
  values (e.g. no fabricated CSS class names) — the script has no live-DOM access on this
  failure path, and a fabricated-but-wrong-looking-real value seemed more dangerous than an
  honest placeholder a human can't miss.
- Only chromium was run natively this session (matches the same sandbox limitation noted in
  Phase 0 — no sudo for OS deps for firefox/webkit outside Docker).

## Open questions for the human
- Still no real app under test — all 3 example specs target playwright.dev (per your answer
  this session, this is still the placeholder). Once/if a real app exists, Phase 1's example
  tests should probably be replaced or supplemented with real ones.
- Should the zenity-based recorder get Mac (`osascript`)/Windows equivalents, or is this
  Linux-desktop-only team for now? Not built — no other OS available to test against here.

## Branch
- `feature/locator-manifest` — ready to hand off for review.
