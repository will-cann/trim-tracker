import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        manifest: 'manifest.html',
      },
    },
  },
  server: {
    // Local growth server (growth/, `npm run dev` there). Mirrors the netlify.toml proxy.
    proxy: {
      '/api/growth': {
        target: process.env.GROWTH_DEV_URL || 'http://localhost:8787',
        rewrite: (path) => path.replace(/^\/api\/growth/, ''),
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    // growth/ is its own package with its own (Postgres-backed) vitest suite.
    exclude: [...configDefaults.exclude, 'growth/**'],
  },
})
