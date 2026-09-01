import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { CREDENCIAIS_REDIRECT, URL_ERP_MOCK, urlSessionStart } from './support/constants';

interface ContadoresMock {
  token: number;
  getSessao: number;
  negocio: number;
}

async function resetarMock(request: APIRequestContext): Promise<void> {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
}

async function contadores(request: APIRequestContext): Promise<ContadoresMock> {
  const resposta = await request.get(`${URL_ERP_MOCK}/__mock/calls`);
  return (await resposta.json()) as ContadoresMock;
}

test.beforeEach(async ({ request }) => {
  await resetarMock(request);
});

test.describe('Cenário 1 — Login automático via redirect do ERP (AUTH-01, AUTH-02)', () => {
  test('responde 302 com Set-Cookie e redireciona para uma URL sem dados sensíveis', async ({
    request,
  }) => {
    const resposta = await request.get(urlSessionStart(), { maxRedirects: 0 });

    expect(resposta.status()).toBe(302);

    const setCookie = resposta.headers()['set-cookie'] ?? '';
    expect(setCookie).toContain('cc_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');

    // FR-002/SC-004: nenhuma credencial no cookie em texto claro...
    expect(setCookie).not.toContain(CREDENCIAIS_REDIRECT.client_secret);
    expect(setCookie).not.toContain(CREDENCIAIS_REDIRECT.password);

    // ...nem na URL de destino do redirect.
    const destino = resposta.headers()['location'] ?? '';
    expect(destino).toBe('/');
    for (const valor of Object.values(CREDENCIAIS_REDIRECT)) {
      expect(destino).not.toContain(valor);
    }

    expect((await contadores(request)).token).toBe(1);
  });

  test('recusa validationKey inválida com 401 e sem chamar o ERP', async ({ request }) => {
    const resposta = await request.get(urlSessionStart({}, 'chave-errada'), { maxRedirects: 0 });

    expect(resposta.status()).toBe(401);
    expect(resposta.headers()['set-cookie']).toBeUndefined();

    // AD-022: a origem é rejeitada antes de gastar uma tentativa de autenticação.
    expect((await contadores(request)).token).toBe(0);
  });

  test('recusa redirect sem os parâmetros obrigatórios, sem chamar o ERP', async ({ request }) => {
    const resposta = await request.get('/session/start?tenant=acme', { maxRedirects: 0 });

    expect(resposta.status()).toBe(400);
    expect((await contadores(request)).token).toBe(0);
  });

  test('repassa o erro do ERP sem setar cookie quando a autenticação é recusada', async ({
    request,
  }) => {
    await request.post(`${URL_ERP_MOCK}/__mock/config`, { data: { statusToken: 400 } });

    const resposta = await request.get(urlSessionStart(), { maxRedirects: 0 });

    expect(resposta.status()).toBe(400);
    expect(resposta.headers()['set-cookie']).toBeUndefined();
  });
});

/** Lê os registros persistidos no Dexie a partir do próprio navegador. */
async function registrosDoDexie(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async () => {
    const abrir = indexedDB.open('centrium-checkout');
    const db = await new Promise<IDBDatabase>((resolver, rejeitar) => {
      abrir.onsuccess = () => resolver(abrir.result);
      abrir.onerror = () => rejeitar(abrir.error);
    });

    return new Promise<Array<Record<string, unknown>>>((resolver, rejeitar) => {
      const pedido = db.transaction('bootstrap').objectStore('bootstrap').getAll();
      pedido.onsuccess = () => resolver(pedido.result as Array<Record<string, unknown>>);
      pedido.onerror = () => rejeitar(pedido.error);
    });
  });
}

test.describe('Cenário 2 — Bootstrap completo antes da tela de venda (AUTH-03/04/05)', () => {
  test('mostra o skeleton até o bootstrap responder e só então libera a venda', async ({
    page,
  }) => {
    // Segura a resposta para o skeleton ficar observável.
    await page.route('**/api/bootstrap', async (route) => {
      await new Promise((resolver) => setTimeout(resolver, 600));
      await route.continue();
    });

    await page.goto(urlSessionStart());

    // FR-004: indicador de carregamento, nunca a tela de venda parcial.
    // (O `<GooeyToaster />` da raiz também tem role="status", por isso o alvo
    // aqui é o testid do skeleton, e não o papel ARIA.)
    await expect(page.getByTestId('skeleton-carregamento')).toBeVisible();
    await expect(page.getByTestId('tela-de-venda')).toHaveCount(0);

    await expect(page.getByTestId('tela-de-venda')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('skeleton-carregamento')).toHaveCount(0);
  });

  test('persiste um registro chaveado por tenant e não retransmite o payload no F5', async ({
    page,
  }) => {
    await page.goto(urlSessionStart());
    await expect(page.getByTestId('tela-de-venda')).toBeVisible();

    const registros = await registrosDoDexie(page);
    expect(registros).toHaveLength(1);
    expect(registros[0]?.['tenant']).toBe('acme');
    expect(registros[0]?.['_versionHash']).toEqual(expect.any(String));

    // FR-008: no F5 sem mudança, o BFF responde 304 e os ~5MB não voltam.
    const statusBootstrap: number[] = [];
    page.on('response', (resposta) => {
      if (resposta.url().includes('/api/bootstrap')) {
        statusBootstrap.push(resposta.status());
      }
    });

    await page.reload();
    await expect(page.getByTestId('tela-de-venda')).toBeVisible();

    expect(statusBootstrap).toEqual([304]);
  });

  test('SC-004: nenhum dado sensível chega ao navegador', async ({ page }) => {
    const corpos: string[] = [];
    page.on('response', async (resposta) => {
      if (resposta.url().includes('/api/')) {
        corpos.push(await resposta.text().catch(() => ''));
      }
    });

    await page.goto(urlSessionStart());
    await expect(page.getByTestId('tela-de-venda')).toBeVisible();

    const tudo = corpos.join('\n') + JSON.stringify(await registrosDoDexie(page));
    expect(tudo).not.toContain(CREDENCIAIS_REDIRECT.client_secret);
    expect(tudo).not.toContain(CREDENCIAIS_REDIRECT.password);
    expect(tudo).not.toContain('access_token');

    // O cookie de sessão é HttpOnly: invisível ao JS da página.
    expect(await page.evaluate(() => document.cookie)).not.toContain('cc_session');
  });
});

test.describe('Cenário 3 — Isolamento por tenant (FR-009)', () => {
  test('grava um registro por tenant, sem sobrescrever o anterior', async ({ page }) => {
    await page.goto(urlSessionStart());
    await expect(page.getByTestId('tela-de-venda')).toBeVisible();

    await page.goto(urlSessionStart({ tenant: 'beta' }));
    await expect(page.getByTestId('tela-de-venda')).toBeVisible();

    const registros = await registrosDoDexie(page);
    const tenants = registros.map((registro) => registro['tenant']).sort();

    expect(tenants).toEqual(['acme', 'beta']);
  });
});

test.describe('Cenário 4 — Falha não-401 no bootstrap (AUTH-07)', () => {
  test('mostra "Tentar novamente" e não uma tela de login', async ({ page, request }) => {
    await request.post(`${URL_ERP_MOCK}/__mock/config`, { data: { statusGetSessao: 500 } });

    await page.goto(urlSessionStart());

    const botao = page.getByRole('button', { name: 'Tentar novamente' });
    await expect(botao).toBeVisible();
    await expect(page.getByTestId('tela-de-venda')).toHaveCount(0);
    // FR-007: nada de campo de usuário/senha.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    // Restabelecido o ERP, o botão recarrega sem exigir novo login.
    await request.post(`${URL_ERP_MOCK}/__mock/config`, { data: { statusGetSessao: 200 } });
    await botao.click();

    await expect(page.getByTestId('tela-de-venda')).toBeVisible();
  });
});

test.describe('Cenário 5 — Renovação silenciosa de sessão (AUTH-06)', () => {
  test('renova o token e refaz a chamada sem erro visível ao cliente', async ({
    page,
    request,
  }) => {
    await page.goto(urlSessionStart());
    await expect(page.getByTestId('tela-de-venda')).toBeVisible();

    const antes = await contadores(request);
    // A próxima chamada de negócio recebe 401 uma vez.
    await request.post(`${URL_ERP_MOCK}/__mock/config`, { data: { respostas401Pendentes: 1 } });

    const resultado = await page.evaluate(async () => {
      const resposta = await fetch('/api/erp/ApiCentriumOAuth/GetProduto?Codigo=1', {
        credentials: 'same-origin',
      });
      return { status: resposta.status, corpo: await resposta.text() };
    });

    // FR-005: o cliente não vê o 401 nem precisa de retry próprio.
    expect(resultado.status).toBe(200);

    const depois = await contadores(request);
    expect(depois.token).toBe(antes.token + 1);
    expect(depois.negocio).toBe(antes.negocio + 2);
  });

  test('encerra a sessão quando a renovação falha, pedindo para reabrir pelo ERP', async ({
    page,
    request,
  }) => {
    await page.goto(urlSessionStart());
    await expect(page.getByTestId('tela-de-venda')).toBeVisible();

    // 401 na chamada de negócio + falha na renovação.
    await request.post(`${URL_ERP_MOCK}/__mock/config`, {
      data: { respostas401Pendentes: 1, statusToken: 400 },
    });

    const status = await page.evaluate(async () => {
      const resposta = await fetch('/api/erp/ApiCentriumOAuth/GetProduto?Codigo=1', {
        credentials: 'same-origin',
      });
      return resposta.status;
    });

    expect(status).toBe(401);

    // O BFF invalidou o cookie: o próximo bootstrap cai na tela de sessão encerrada
    // (carrinho vazio — o aviso de venda em digitação depende das features 001/003).
    await page.reload();
    await expect(page.getByText('Sessão encerrada')).toBeVisible();
    await expect(page.getByText('Reabra o Checkout a partir do ERP para continuar.')).toBeVisible();
  });
});
