import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BFF_DEV_TARGET = process.env.BFF_DEV_TARGET ?? 'http://127.0.0.1:3000';

// SPA React servida pelo mesmo processo Node do BFF em produção (plan.md § Structure
// Decision): o build vai para `dist/client`, de onde `@fastify/static` o serve.
// Em dev, o Vite roda separado e faz proxy de `/session/*` e `/api/*` para o BFF.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
  },
  worker: {
    // O parse/validação do bootstrap (~5MB) roda em Web Worker de módulo (AUTH-04).
    format: 'es',
  },
  server: {
    port: 5173,
    proxy: {
      '/session': { target: BFF_DEV_TARGET, changeOrigin: false },
      '/api': { target: BFF_DEV_TARGET, changeOrigin: false },
    },
  },
});
