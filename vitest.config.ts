import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mesmo alias do `vite.config.ts`, para os testes resolverem `@/…`.
    alias: { '@': fileURLToPath(new URL('./src/client', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.spec.{ts,tsx}', 'tests/integration/**/*.spec.{ts,tsx}'],
    // E2E é responsabilidade do Playwright (`playwright.config.ts`).
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
