import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxies /api to the Phase 4 backend so the browser never sees a cross-origin request —
// avoids needing CORS middleware on the server (see PROGRESS.md open question this resolves).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
})
