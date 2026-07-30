# web — React frontend (Phase 5)

Vite + React + TypeScript. Talks to the Phase 4 backend (`../server/`) via `/api/*`, proxied by
Vite's dev server to `http://127.0.0.1:4000` by default (override with `API_PROXY_TARGET`) — see
the root `README.md`'s "Backend API" section for what that API exposes.

```bash
npm install
npm run dev      # dev server on :5173, proxies /api to the backend
npm run build     # tsc -b && vite build
```

Requires the backend running (`npm run server:start` from the repo root) for anything beyond
the login screen to load real data.
