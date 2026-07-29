# Testing Framework V2

Playwright-based E2E testing framework where AI is used only as a failure-path exception
handler — never as a per-run participant. See `REQUIREMENTS.md` for the full non-negotiable
philosophy and `PLAN.md` for the phased build order. `PROGRESS.md` tracks current status.

## Repo layout

- `tests/` — Playwright `.spec.ts` files, recorded via Codegen. Larger/reused flows are
  structured as Page Objects (see `tests/pages/`); smaller ones may keep locators inline.
- `manifests/` — one JSON file per spec, keyed by element name, each with a `primary` locator
  plus 2-3 `fallbacks`. Read only when a locator fails at runtime — never during a normal
  passing run.
- `scripts/` — `record-test.js`/`record-test.sh` (point-and-click test recorder),
  `generate-manifest.js` (manifest scaffolding), and `apply-healing-patches.js` (commits a
  healed locator fix to its own branch after a test run); AI escalation lands in Phase 3.
- `tests/support/resilient-locator.ts` — the locator wrapper tests call to get deterministic
  fallback healing (see "Self-healing" below).
- `.github/workflows/` — CI, running inside the same container image used locally.
- `Dockerfile` / `docker-compose.yml` — pin the exact browser/OS environment so local and CI
  runs are identical.

## Running the suite

### Via Docker (recommended — matches CI exactly)

```bash
docker compose run --rm tests
```

This builds the image from `Dockerfile` (based on
`mcr.microsoft.com/playwright:v1.62.0-jammy`) and runs `npx playwright test` inside it. Reports
land in `./playwright-report` and `./test-results` on the host via bind mounts.

### Natively (faster local iteration)

Requires Node.js and the Playwright browsers installed locally:

```bash
npm install
npx playwright install --with-deps
npm test
```

Other useful scripts: `npm run test:ui` (Playwright's UI mode), `npm run test:headed` (headed
browser), `npm run report` (open the last HTML report).

## Recording a test

### Point-and-click (no terminal, no commands to type)

1. Double-click `scripts/record-test.sh` (or open a file manager and run it — mark it
   executable first if your OS doesn't preserve the `+x` bit on clone).
2. A pop-up asks for the web address to record. Then a second pop-up asks for a short test
   name (e.g. "login flow") — this becomes the file name.
3. A real browser opens with Playwright's recorder panel attached. Click through the app the
   way a user would; every click/type/check turns into test code automatically. Close the
   browser when you're done.
4. The recorded test is saved to `tests/<name>.spec.ts`, and a starter locator manifest is
   scaffolded automatically to `manifests/<name>.json`.
5. Hand the two files to a developer to review: the manifest's fallback locators are heuristic
   placeholders marked `TODO` (this script can't guess real test-id/CSS values without a human
   inspecting the DOM), and the recorded steps may be worth refactoring behind a Page Object
   under `tests/pages/` for larger flows.

This requires a Linux desktop with `zenity` installed (`sudo apt install zenity`) for the
pop-up prompts.

### Terminal (for developers)

```bash
npx playwright codegen <url> --output tests/<name>.spec.ts
node scripts/generate-manifest.js tests/<name>.spec.ts
```

Refactoring interactions behind a Page Object in `tests/pages/` is recommended for larger/
reused flows, but not required — `generate-manifest.js` scans both styles (raw inline locators
or a Page Object's constructor). Run the test locally (Docker or native, above) before
committing either way.

## Locator manifests

Each spec has a companion `manifests/<spec-name>.json` capturing 2-3 fallback locator
strategies (role/test-id/CSS/text/label/placeholder) per interactive element. See
`manifests/schema.json` for the full shape. The manifest is metadata only — it's read only
when a locator fails at runtime (Phase 2+), never during a normal passing run.

`scripts/generate-manifest.js <spec.ts> [--force]` scaffolds one by scanning the spec (and any
Page Object it imports) for `page.getBy*()`/`page.locator()` calls. Its fallback suggestions
are heuristic placeholders marked `TODO` — always review and fill in real values before relying
on them for self-healing.

## Self-healing (deterministic, no AI)

A test that wants fallback healing calls `resilientLocator(page, specPath, elementKey,
() => <primary locator>)` instead of using the primary locator directly — see
`tests/self-healing-demo.spec.ts` for a worked example with a deliberately broken primary. On
the normal path (primary resolves) the manifest is never even read. Only if the primary times
out does it load `manifests/<spec>.json` and try each fallback in order; a `[SELF-HEALED]`
line is logged the moment one works, and the event is appended to
`test-results/healing-events.jsonl` (override the path with `HEALING_LOG_PATH`).

After a run with healing events, `node scripts/apply-healing-patches.js`:
1. Patches the manifest (promotes the working fallback to `primary`, demotes the old primary
   into `fallbacks`) and the `.spec.ts` (swaps in the new locator's code) for each healed
   element.
2. Commits those two files to a fresh local branch, `auto/healed-<unix-ms>`, then switches back
   to whatever branch you were on.
3. Does **not** push or open a PR — it prints the `git push`/`gh pr create` commands for you to
   run once you've reviewed the diff. No AI is involved in this path; that's Phase 3.

This script refuses to run if the spec/manifest it would patch aren't already committed and
clean on your current branch — patching an untracked file and then switching branches would
make that file vanish from your working tree (it'd only exist on the new `auto/healed-*`
branch). Commit your recorded test before relying on self-healing.

## Environment variables

- `BASE_URL` — base URL of the app under test. Unset in Phase 0 since the smoke test targets
  an absolute URL directly; set this once a real app under test is wired up.
- `CI` — set automatically by GitHub Actions; enables retries and disables `test.only` locally
  slipping through.

## Current status

Phase 2 (deterministic self-healing) — see `PROGRESS.md` for details and next steps.
