# Testing Framework V2

Playwright-based E2E testing framework where AI is used only as a failure-path exception
handler — never as a per-run participant. See `REQUIREMENTS.md` for the non-negotiable
philosophy, `PLAN.md` for the phased build order, `PROGRESS.md` for current status, and
`ARCHITECTURE.md` for how the pieces fit together (repo layout, recording, self-healing, API,
frontend, full environment variable reference).

## Setup

Requires Node.js 24+.

### 1. Install and run the test suite

```bash
npm install
npx playwright install --with-deps
npm test
```

### 2. Run the backend API

```bash
APP_USERNAME=admin APP_PASSWORD=change-me npm run server:start   # :4000, PORT to override
```

This is also how you set the login credentials — there's no signup/user database, just one
shared username/password pair from these two env vars (server refuses to start without both).

### 3. Run the frontend

```bash
cd web
npm install
npm run dev   # :5173, proxies API calls to the backend above
```

Open `http://localhost:5173` and log in with the `APP_USERNAME`/`APP_PASSWORD` you started the
backend with.
