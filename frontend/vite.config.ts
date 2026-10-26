/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Recharts is most of the bundle (~200 KB gzipped); one chunk is fine for a single page.
  build: { chunkSizeWarningLimit: 800 },
  server: {
    // In development the API runs separately (uvicorn on :8000).
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
