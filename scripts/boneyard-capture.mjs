import { spawn } from 'node:child_process';
import { createServer } from 'vite';

/**
 * Regenera os "bones" do skeleton de carregamento (`npm run bones`).
 *
 * O CLI do Boneyard sobe um Chromium headless, navega até o dev server e
 * fotografa o layout real de cada `<Skeleton name="...">` que encontrar no DOM.
 * Só que `LoadingSkeleton` fica na tela apenas enquanto `GET /api/bootstrap`
 * não respondeu: com o BFF fora do ar a SPA cai em "Tentar novamente" antes da
 * captura, e o CLI não acha nenhum `<Skeleton>` ("No skeletons found").
 *
 * Por isso este script sobe o Vite com um middleware que engole
 * `/api/bootstrap` e nunca responde — a SPA fica no estado de carregamento pelo
 * tempo da captura. Nada disso toca o código de produção: o que o CLI fotografa
 * é a prop `fixture` do `<Skeleton>`, que é estática.
 *
 * Os arquivos gerados em `src/client/bones/` são versionados (padrão do
 * pacote): só precisam ser regerados quando o layout do skeleton mudar.
 */

const PORTA = 5199;
const URL_CAPTURA = `http://localhost:${PORTA}`;

/** Deixa `GET /api/bootstrap` pendurado para a SPA não sair do carregamento. */
const pluginBootstrapPendente = {
  name: 'boneyard-bootstrap-pendente',
  configureServer(servidor) {
    // Registrado antes dos middlewares internos do Vite, então tem precedência
    // sobre o proxy de `/api` configurado em `vite.config.ts`.
    servidor.middlewares.use('/api/bootstrap', () => {
      /* de propósito: nunca responde */
    });
  },
};

async function main() {
  const servidor = await createServer({
    configFile: 'vite.config.ts',
    server: { port: PORTA, strictPort: true },
    plugins: [pluginBootstrapPendente],
  });

  await servidor.listen();
  console.log(`[bones] dev server de captura em ${URL_CAPTURA}`);

  try {
    const codigo = await new Promise((resolver, rejeitar) => {
      const cli = spawn('npx', ['boneyard-js', 'build', URL_CAPTURA], {
        stdio: 'inherit',
        shell: true,
      });
      cli.on('error', rejeitar);
      cli.on('close', resolver);
    });

    if (codigo !== 0) {
      throw new Error(`boneyard-js build terminou com código ${String(codigo)}`);
    }
  } finally {
    await servidor.close();
  }
}

await main();
