# Architecture

How the pieces fit together. See `README.md` for setup, `REQUIREMENTS.md` for the non-negotiable
philosophy, `PLAN.md` for the phased build order, and `PROGRESS.md` for current status.

## Repo layout

- `tests/` — Playwright `.spec.ts` files. Larger/reused flows are structured as Page Objects
  (see `tests/pages/`); smaller ones may keep locators inline.
- `manifests/` — one JSON file per spec, keyed by element name, each with a `primary` locator
  plus 2-3 `fallbacks`. Read only when a locator fails at runtime — never during a normal
  passing run.
- `scripts/` — `record-test.js`/`record-test.sh` (point-and-click test recorder),
  `generate-manifest.js` (manifest scaffolding), `apply-healing-patches.js` (commits a healed
  locator fix to its own branch after a test run).
- `tests/support/resilient-locator.ts` — the locator wrapper tests call to get deterministic
  fallback healing (see "Self-healing" below).
- `server/` — Express/TypeScript backend API (Phase 4) + recording session infrastructure
  (Phase 6).
- `web/` — Vite + React + TypeScript frontend (Phase 5).
- `.github/workflows/` — CI, installing Playwright's browsers fresh on the runner (same
  `@playwright/test` version pinned in `package.json` as everywhere else).

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
pop-up prompts. Superseded for non-technical users by the in-app recorder below (Phase 6).

### Terminal (for developers)

```bash
npx playwright codegen <url> --output tests/<name>.spec.ts
node scripts/generate-manifest.js tests/<name>.spec.ts
```

Refactoring interactions behind a Page Object in `tests/pages/` is recommended for larger/
reused flows, but not required — `generate-manifest.js` scans both styles (raw inline locators
or a Page Object's constructor). Run the test locally before committing either way.

### In-app recorder (Phase 6 — no CLI, no local install)

From the web app's "New Recording" screen: enter a URL, interact with a live streamed browser
(server-side headless Chromium, screencast over a websocket), click Stop, review the recorded
steps, name it, and save. Generates the same `.spec.ts` + manifest shape as the flows above,
using `resilientLocator(...)` so every recorded test gets deterministic self-healing for free.
See `server/src/recording/` for the implementation.

## Locator manifests

Each spec has a companion `manifests/<spec-name>.json` capturing 2-3 fallback locator
strategies (role/test-id/CSS/text/label/placeholder) per interactive element. See
`manifests/schema.json` for the full shape. The manifest is metadata only — it's read only
when a locator fails at runtime, never during a normal passing run.

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
   run once you've reviewed the diff. No AI is involved in this path.

This script refuses to run if the spec/manifest it would patch aren't already committed and
clean on your current branch — patching an untracked file and then switching branches would
make that file vanish from your working tree (it'd only exist on the new `auto/healed-*`
branch). Commit your recorded test before relying on self-healing.

Internal/dev-only tool now — the end-user-facing product replaces this git-branch/PR flow with
an in-app Pending Fixes approve/reject queue (Phase 8).

## Backend API

`server/` is a thin Express/TypeScript API that wraps the existing engine so a client never
needs file or git access. Runs directly with `node`; Node 24's native TypeScript support means
no build step or `ts-node`/`tsx` dependency.

```bash
APP_USERNAME=admin APP_PASSWORD=change-me npm run server:start   # listens on :4000 (PORT to override)
npm run test:server                                              # node:test integration suite
```

- Single shared HTTP Basic login (`APP_USERNAME`/`APP_PASSWORD` env vars — no defaults, the
  server refuses to start without both). No signup/user database — this is the only way to set
  the login credentials.
- `GET /api/health` — unauthenticated liveness check.
- `GET/POST /api/tests`, `PATCH|DELETE /api/tests/:id` — test-case metadata (name + which
  `.spec.ts` it points at).
- `POST /api/tests/:id/runs` — runs that spec via `npx playwright test --project=chromium
  --reporter=json` and stores the structured result; `GET /api/tests/:id/runs` /
  `GET /api/runs/:runId` read results back.
- `GET /api/pending-fixes`, `PATCH /api/pending-fixes/:id` — the Pending Fixes storage
  foundation for Phase 8's review queue; nothing populates it yet (Phase 2's healing pipeline
  still logs to `healing-events.jsonl` until Phase 8 rewires it).
- `POST /api/recordings`, `POST /api/recordings/:id/stop`, `POST /api/recordings/:id/save` —
  start/stop/save an in-app recording session (Phase 6). The live screencast/input channel
  itself is a websocket at `/ws/recordings/:id`, not a REST call.
- All storage is JSON files under `server/data/` (gitignored, created on first write;
  override with `DATA_DIR` for tests/scratch runs).

## Recording session infrastructure (Phase 6)

`server/src/recording/` — one headless Playwright browser per recording session:

- `session.ts` — `RecordingSession`: launches the browser, streams it out via CDP
  `Page.startScreencast`, injects input back via `Input.dispatchMouseEvent`/
  `dispatchKeyEvent`/`insertText`.
- `recorderScript.ts` — injected into the recorded page; watches clicks/input and reports each
  with candidate locator strategies (same vocabulary as the manifest schema).
- `sessionManager.ts` — concurrency cap, idle timeout, cleanup on disconnect.
- `codegen.ts` — turns a recorded action list into a `.spec.ts` + manifest pair, reusing
  `scripts/lib/manifest.js`'s locator-code generation.
- `websocketHandler.ts` — the screencast/input websocket channel. Auth note: browsers' native
  WebSocket API can't set an Authorization header, so this trusts possession of the session id
  (a UUID returned only from the already-authenticated `POST /api/recordings`) as the
  capability — fine for a single-shared-login internal tool, would need revisiting otherwise.

## Frontend

`web/` is a Vite + React + TypeScript app: login screen, test list, per-test run history, the
Pending Fixes review queue, and the in-app recorder ("New Recording").

```bash
cd web && npm install
npm run dev   # :5173, proxies /api and /ws to the backend (API_PROXY_TARGET overrides the target)
```

Needs the backend running (`npm run server:start` from the repo root) to show real data.

## Environment variables

- `APP_USERNAME`, `APP_PASSWORD` — the shared login (backend). Required; no defaults.
- `PORT` — backend listen port. Default `4000`.
- `DATA_DIR` — where the backend stores its JSON data files. Default `server/data/`.
- `API_PROXY_TARGET` — backend URL the frontend dev server proxies `/api` and `/ws` to. Default
  `http://127.0.0.1:4000`.
- `HEALING_LOG_PATH` — where self-healing events are logged during a test run. Default
  `test-results/healing-events.jsonl`.
- `BASE_URL` — base URL of the app under test for the example specs. Unset by default; the
  example specs target playwright.dev directly since no real app under test is wired up yet.
- `CI` — set automatically by GitHub Actions; enables retries and disables `test.only` locally
  slipping through.
