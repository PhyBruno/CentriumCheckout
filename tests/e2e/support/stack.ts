import { loadEnv } from '../../../src/server/config/env';
import { buildApp } from '../../../src/server/index';
import { criarMockErp } from './erp-mock';
import { ENV_DA_ENTRADA } from '../../support/entradaCifrada';
import { PORTA_BFF, PORTA_ERP_MOCK, SESSION_SECRET } from './constants';

/**
 * Sobe a stack completa dos cenários E2E: ERP mockado + BFF servindo o build da
 * SPA. Chamado pelo `webServer` do `playwright.config.ts`.
 */
async function main(): Promise<void> {
  await criarMockErp(PORTA_ERP_MOCK);

  const env = loadEnv({
    baseDomain: 'apps.example.test',
    ...ENV_DA_ENTRADA,
    SESSION_SECRET,
    NODE_ENV: 'test',
    PORT: String(PORTA_BFF),
    // O ERP mockado roda em HTTP local: `<tenant>.<baseDomain>` não resolveria.
    ERP_PROTOCOL: 'http',
    ERP_HOST_OVERRIDE: `127.0.0.1:${PORTA_ERP_MOCK}`,
    SERVE_STATIC_CLIENT: 'true',
    // Chave da 017 repassada do ambiente do Playwright: o `pagamento-geral.spec`
    // roda nas duas variantes (`DESCONTO_CAPA_NO_ERP=true npx playwright test …`).
    DESCONTO_CAPA_NO_ERP: process.env['DESCONTO_CAPA_NO_ERP'] ?? 'false',
  });

  const app = await buildApp(env);
  await app.listen({ port: PORTA_BFF, host: '127.0.0.1' });

  console.log(`[e2e] BFF em http://127.0.0.1:${PORTA_BFF} | ERP mock em :${PORTA_ERP_MOCK}`);
}

await main();
