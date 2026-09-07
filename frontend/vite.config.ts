import { defineConfig } from 'vite'

// Dev server proxies API calls to the FastAPI backend on :8080.
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
      '/stream': 'http://localhost:8080',
    },
  },
  build: { outDir: 'dist' },
})
