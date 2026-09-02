import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { loadEnv, type Env } from './config/env';
import { criarCifradorDeSessao } from './session/cookie';
import { registrarRotaSessionStart } from './routes/session-start';
import { registrarRotaBootstrap } from './routes/bootstrap';
import { registrarRotaErpProxy } from './routes/erp-proxy';

/**
 * Monta a instância Fastify do BFF.
 *
 * Recebe o ambiente já resolvido (Dependency Inversion — Constitution II): os
 * testes injetam um `Env` sintético sem depender de `process.env`.
 */
export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.nodeEnv !== 'test',
    // O redirect do ERP chega com credenciais na query string; nunca logar a URL
    // crua. A opção está marcada como deprecada no Fastify 5 (sai no 6), mas a
    // substituta `logController` exige uma subclasse de controlador de log —
    // migração que cabe na atualização para o Fastify 6, não aqui.
    disableRequestLogging: true,
  });

  await app.register(fastifyCookie);

  // Sonda de readiness — usada pelo Docker e pelo `webServer` do Playwright.
  app.get('/health', async () => ({ status: 'ok' }));

  const cifrador = criarCifradorDeSessao(env.sessionSecret);

  registrarRotaSessionStart(app, { env, cifrador });
  registrarRotaBootstrap(app, { env, cifrador });
  registrarRotaErpProxy(app, { env, cifrador });

  // Assets estáticos da SPA (build do Vite) servidos pelo mesmo processo Node —
  // não há Nginx separado (plan.md § Structure Decision).
  if (env.serveStaticClient) {
    await app.register(fastifyStatic, {
      root: env.clientDistDir,
      wildcard: false,
    });

    // Fallback de SPA: qualquer navegação que não casa com rota/arquivo entrega
    // o index.html e deixa o roteamento para o cliente.
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ erro: 'Rota não encontrada' });
    });
  }

  return app;
}

async function start(): Promise<void> {
  const env = loadEnv(process.env);
  const app = await buildApp(env);

  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  await start();
}
