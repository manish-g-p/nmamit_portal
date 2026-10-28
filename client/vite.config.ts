import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } } }, // same-origin in dev, so cookies just work
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/setupTests.ts'] },
});
