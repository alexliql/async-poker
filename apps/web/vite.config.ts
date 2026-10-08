import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** `pnpm dev` at the repo root builds this app and serves it from the Worker; this config is for `vite` alone. */
const server = process.env.HOLDEM_SERVER ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: server, ws: true, changeOrigin: true },
      '/og': { target: server, changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
