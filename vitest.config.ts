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
    /**
     * Folga sobre o default de 5s, por causa do custo de import do vitest 5.
     *
     * O **primeiro** teste de cada arquivo paga a avaliação dos módulos daquele
     * arquivo, e desde o bump para vitest 5 (PR #72) o import passou a responder
     * por ~62% do tempo de suíte. `sessionStartUsuario.spec.ts`, que monta o app
     * Fastify inteiro, levava ~2,2s no vitest 3 e passou a oscilar em torno dos
     * 5s: falhou numa execução da suíte cheia e passou na seguinte, enquanto
     * isolado passa sempre. É contenção, não lentidão do que o teste mede — o
     * caso em questão nem espera por `comRepeticao`.
     *
     * 20s é folga para o cold start sem deixar de pegar travamento de verdade.
     */
    testTimeout: 20_000,
  },
});
