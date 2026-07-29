# Testing Framework V2

Playwright-based E2E testing framework where AI is used only as a failure-path exception
handler — never as a per-run participant. See `REQUIREMENTS.md` for the full non-negotiable
philosophy and `PLAN.md` for the phased build order. `PROGRESS.md` tracks current status.

## Repo layout

- `tests/` — Playwright `.spec.ts` files, recorded via Codegen, structured as Page Objects
  (see `tests/pages/`).
- `manifests/` — one JSON file per spec, keyed by element name, each with a `primary` locator
  plus 2-3 `fallbacks`. Read only when a locator fails at runtime — never during a normal
  passing run.
- `scripts/` — supporting tooling (e.g. manifest scaffolding, self-healing patch/PR logic),
  added as later phases land.
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

1. Run Codegen against the target app:
   ```bash
   npx playwright codegen <url>
   ```
2. Save the generated spec under `tests/`, refactoring interactions behind a Page Object in
   `tests/pages/` rather than leaving raw locators inline in the test body.
3. Add a companion manifest file under `manifests/<spec-name>.json` capturing 2-3 fallback
   locator strategies per interactive element (role/test-id/CSS) — see `manifests/smoke.json`
   for the current shape. This schema is provisional until Phase 1 finalizes it.
4. Run the test locally (Docker or native, above) before committing.

## Environment variables

- `BASE_URL` — base URL of the app under test. Unset in Phase 0 since the smoke test targets
  an absolute URL directly; set this once a real app under test is wired up.
- `CI` — set automatically by GitHub Actions; enables retries and disables `test.only` locally
  slipping through.

## Current status

Phase 0 (project scaffolding) — see `PROGRESS.md` for details and next steps.
