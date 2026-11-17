import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The browser calls relative /api and /media URLs; Vite forwards them to FastAPI.
// Native run: backend on http://localhost:8000. Docker: API_PROXY_TARGET=http://backend:8000
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const target = env.API_PROXY_TARGET || 'http://localhost:8000'
const proxy = { '/api': { target, changeOrigin: true }, '/media': { target, changeOrigin: true } }

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 5173, strictPort: true, proxy },
})
