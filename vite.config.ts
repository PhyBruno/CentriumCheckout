import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

const BFF_DEV_TARGET = process.env.BFF_DEV_TARGET ?? 'http://127.0.0.1:3000';

// `--mode lan` (script `dev:client:lan`) serve o dev server em HTTPS com
// certificado autoassinado, aberto para a rede. Existe para abrir o Checkout de
// outro aparelho: o cookie de sessão é `Secure` (`src/server/session/cookie.ts`),
// e o navegador só aceita cookie `Secure` em HTTPS ou em `localhost` — por
// `http://<ip-da-lan>` o `/session/start` responde o 302, mas o cookie é
// descartado e a entrada falha.
//
// Para usar de fato num celular prefira `preview:client:lan` (build servido) a
// `dev:client:lan`: em dev o `reicon-react` chega inteiro (~8MB) e a página faz
// ~200 requisições, e o Chrome não guarda cache de origem com certificado não
// confiável — cada recarga baixa tudo de novo pelo Wi-Fi.
const MODO_LAN = 'lan';

// SPA React servida pelo mesmo processo Node do BFF em produção (plan.md § Structure
// Decision): o build vai para `dist/client`, de onde `@fastify/static` o serve.
// Em dev, o Vite roda separado e faz proxy de `/session/*` e `/api/*` para o BFF.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === MODO_LAN ? [basicSsl()] : [])],
  resolve: {
    // `@` aponta para a SPA — é o alias que o shadcn/ui usa em seus imports.
    alias: { '@': fileURLToPath(new URL('./src/client', import.meta.url)) },
  },
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
      // O Menu gerencial (AD-203) abre `/gerencial/<destino>` numa aba nova, e
      // quem responde o `302` é o BFF. Sem esta entrada o Vite serviria o
      // `index.html` da SPA e a aba nova abriria o Checkout de novo.
      '/gerencial': { target: BFF_DEV_TARGET, changeOrigin: false },
    },
  },
}));
