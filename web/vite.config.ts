import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxies /api to the Phase 4 backend so the browser never sees a cross-origin request —
// avoids needing CORS middleware on the server (see PROGRESS.md open question this resolves).
// /ws is the Phase 6 recording session's screencast/input channel — a separate top-level path
// (not under /api) since it's a websocket upgrade, not a REST call; needs its own proxy entry
// with `ws: true` since Vite doesn't proxy upgrades for an HTTP-only entry.
const target = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:4000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target, changeOrigin: true },
      '/ws': { target, ws: true, changeOrigin: true },
    },
  },
})
