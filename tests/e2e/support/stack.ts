import { loadEnv } from '../../../src/server/config/env';
import { buildApp } from '../../../src/server/index';
import { criarMockErp } from './erp-mock';
import { PORTA_BFF, PORTA_ERP_MOCK, SESSION_SECRET, VALIDATION_KEY } from './constants';

/**
 * Sobe a stack completa dos cenários E2E: ERP mockado + BFF servindo o build da
 * SPA. Chamado pelo `webServer` do `playwright.config.ts`.
 */
async function main(): Promise<void> {
  await criarMockErp(PORTA_ERP_MOCK);

  const env = loadEnv({
    baseDomain: 'apps.example.test',
    validationKey: VALIDATION_KEY,
    SESSION_SECRET,
    NODE_ENV: 'test',
    PORT: String(PORTA_BFF),
    // O ERP mockado roda em HTTP local: `<tenant>.<baseDomain>` não resolveria.
    ERP_PROTOCOL: 'http',
    ERP_HOST_OVERRIDE: `127.0.0.1:${PORTA_ERP_MOCK}`,
    SERVE_STATIC_CLIENT: 'true',
  });

  const app = await buildApp(env);
  await app.listen({ port: PORTA_BFF, host: '127.0.0.1' });

  console.log(`[e2e] BFF em http://127.0.0.1:${PORTA_BFF} | ERP mock em :${PORTA_ERP_MOCK}`);
}

await main();
