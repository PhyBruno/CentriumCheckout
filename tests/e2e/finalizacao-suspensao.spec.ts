import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';

/**
 * Fluxo dourado de finalização e suspensão (`quickstart.md`, Camada 3) —
 * cobre T021 e T026.
 *
 * O serviço de impressão local é **stubado** (`page.route`): a chamada real vai
 * do navegador direto ao `CadMaqHost`, na rede do PDV, fora do alcance do CI
 * (`contracts/impressao-local-api.md`).
 *
 * **Fora do alcance desta camada, por não existir caminho de operador:**
 * - *Venda retomada de rascunho* (`NumeroNota` ≠ 0, passo 2 do quickstart): a
 *   UI de retomada é da feature 011, ainda não implementada — não há como um
 *   operador chegar nesse estado pela tela. Coberto em
 *   `tests/integration/finalizacaoSuspensao.spec.ts`, que popula
 *   `identidadeVenda` direto.
 * - *Bloqueio de suspensão com TEF/PIX aprovado* (passo 4): depende do
 *   predicado da feature 008, hoje um stub — não há UI de pagamento para
 *   aprovar um TEF. Coberto na mesma suíte de integração (T022).
 */

interface ContadoresMock {
  token: number;
  getSessao: number;
  negocio: number;
  getProduto: number;
  getListaProdutos: number;
  faturarNFCe: number;
  getStatusSistema: number;
}

interface RetratoFaturado {
  retrato: {
    SuspenderOuFaturar?: string;
    NumeroNota?: number;
    CadSerieNFCe?: string;
    Log?: string;
    produtos?: unknown[];
  } | null;
}

const SKU = '001234';
const URL_SERVICO_IMPRESSAO = 'http://127.0.0.1:4545/**';

async function contadores(request: APIRequestContext): Promise<ContadoresMock> {
  const resposta = await request.get(`${URL_ERP_MOCK}/__mock/calls`);
  return (await resposta.json()) as ContadoresMock;
}

async function ultimoRetrato(request: APIRequestContext): Promise<RetratoFaturado> {
  const resposta = await request.get(`${URL_ERP_MOCK}/__mock/ultimo-faturamento`);
  return (await resposta.json()) as RetratoFaturado;
}

async function configurar(
  request: APIRequestContext,
  config: Record<string, unknown>,
): Promise<void> {
  await request.post(`${URL_ERP_MOCK}/__mock/config`, { data: config });
}

/** Serviço de impressão local que aceita tudo — o caminho feliz de `'E'`. */
async function stubarImpressoraLocal(page: Page): Promise<void> {
  await page.route(URL_SERVICO_IMPRESSAO, (rota) => rota.fulfill({ status: 200, body: '' }));
}

async function abrirTelaDeVenda(page: Page): Promise<void> {
  await page.goto(urlSessionStart());
  await expect(page.getByTestId('tela-de-venda')).toBeVisible();
}

async function biparProduto(page: Page): Promise<void> {
  const campo = page.getByTestId('campo-codigo-produto');
  await campo.fill(SKU);
  await campo.press('Enter');
  await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
}

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

test.describe('User Story 1 — finalizar a venda (T021)', () => {
  test('venda nova é faturada com NumeroNota = 0 e o cupom vai para a impressora (passo 1)', async ({
    page,
    request,
  }) => {
    await stubarImpressoraLocal(page);
    await abrirTelaDeVenda(page);
    await biparProduto(page);

    await page.getByTestId('botao-finalizar-venda').click();

    // Caminho feliz não tem modal (pedido do usuário, 2026-09-02): o cupom sai
    // na impressora e a tela volta para a próxima venda. O sinal observável é o
    // carrinho zerado, não um diálogo a fechar.
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0);
    await expect(page.getByTestId('dialogo-documento-fiscal')).toHaveCount(0);

    const { retrato } = await ultimoRetrato(request);
    expect(retrato?.SuspenderOuFaturar).toBe('FATURAR');
    expect(retrato?.NumeroNota).toBe(0);
    expect(retrato?.CadSerieNFCe).toBe('1');
    expect(retrato?.produtos).toHaveLength(1);

    // `FR-011`/SC-001: o histórico completo acompanha a emissão e termina no
    // evento terminal da operação.
    const eventos: { tipo: string }[] = JSON.parse(retrato?.Log ?? '[]');
    expect(eventos[0]?.tipo).toBe('VENDA_INICIADA');
    expect(eventos.at(-1)?.tipo).toBe('VENDA_FINALIZADA');
  });

  test('falha de rede exige confirmação manual antes de qualquer novo envio (passo 5)', async ({
    page,
    request,
  }) => {
    await stubarImpressoraLocal(page);
    await abrirTelaDeVenda(page);
    await biparProduto(page);

    // Aborta só o primeiro `FaturarNFCe`: é a falha "sem resposta recebida" que
    // AD-038 trata — o navegador nunca soube se o ERP processou.
    let jaAbortou = false;
    await page.route('**/api/erp/ApiCentriumOAuth/FaturarNFCe', async (rota) => {
      if (jaAbortou) {
        await rota.continue();
        return;
      }
      jaAbortou = true;
      await rota.abort('failed');
    });

    await page.getByTestId('botao-finalizar-venda').click();

    await expect(page.getByTestId('dialogo-confirmar-reenvio')).toBeVisible();
    expect((await contadores(request)).faturarNFCe).toBe(0);

    // O botão de finalizar não reabre um segundo envio enquanto a confirmação
    // não vier (`FR-004`, SC-003).
    await expect(page.getByTestId('botao-finalizar-venda')).toBeDisabled();

    await page.getByTestId('confirmar-reenvio').click();

    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0);
    expect((await contadores(request)).faturarNFCe).toBe(1);

    // O `Log` reenviado inclui a falha anterior e é estritamente maior.
    const { retrato } = await ultimoRetrato(request);
    const eventos: { tipo: string }[] = JSON.parse(retrato?.Log ?? '[]');
    expect(eventos.map((evento) => evento.tipo)).toContain('FATURAMENTO_FALHOU');
  });

  test("impressão direta indisponível oferece o PDF, sem falhar em silêncio (passo 6, TipoImpressao 'E')", async ({
    page,
  }) => {
    // Serviço local fora do ar: a rota é abortada em vez de respondida.
    await page.route(URL_SERVICO_IMPRESSAO, (rota) => rota.abort('failed'));
    await abrirTelaDeVenda(page);
    await biparProduto(page);

    await page.getByTestId('botao-finalizar-venda').click();

    await expect(page.getByTestId('dialogo-documento-fiscal')).toBeVisible();
    await expect(page.getByTestId('dialogo-documento-fiscal').getByRole('alert')).toBeVisible();
    // Abre em outra aba, nunca baixa (pedido do usuário, 2026-09-02).
    await expect(page.getByTestId('abrir-pdf-documento-fiscal')).toBeVisible();
  });

  test('recusa de negócio do ERP não abre confirmação de reenvio (research.md D2)', async ({
    page,
    request,
  }) => {
    await configurar(request, { faturarSemNotaFiscal: true });
    await stubarImpressoraLocal(page);
    await abrirTelaDeVenda(page);
    await biparProduto(page);

    await page.getByTestId('botao-finalizar-venda').click();

    // Erro de transmissão da NFCe abre modal próprio, não um texto ao pé do
    // botão (pedido do usuário, 2026-09-02).
    await expect(page.getByTestId('dialogo-erro-faturamento')).toBeVisible();
    await expect(page.getByTestId('erro-finalizacao')).toContainText(/não autorizada/i);
    await expect(page.getByTestId('dialogo-confirmar-reenvio')).toHaveCount(0);

    await page.getByTestId('fechar-erro-faturamento').click();

    // Reenvio livre: o botão volta a ficar disponível sem confirmação extra.
    await expect(page.getByTestId('botao-finalizar-venda')).toBeEnabled();
    // A venda **não** foi descartada: nada de sucesso aconteceu (`FR-012`).
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
  });

  test('"Finalizar venda" nasce desabilitado e só libera com valor no carrinho', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);

    await expect(page.getByTestId('botao-finalizar-venda')).toBeDisabled();
    await expect(page.getByTestId('botao-cancelar-venda')).toBeDisabled();

    await biparProduto(page);

    await expect(page.getByTestId('botao-finalizar-venda')).toBeEnabled();
    await expect(page.getByTestId('botao-cancelar-venda')).toBeEnabled();
  });

  test('"Cancelar venda" bloqueado explica o motivo ao ser clicado', async ({ page, request }) => {
    await abrirTelaDeVenda(page);

    // Padrão de bloqueio explicativo (pedido do usuário, 2026-09-03): o botão é
    // `aria-disabled`, não `disabled`, para o clique poder informar a razão.
    // (`force`: a checagem de actionability do Playwright recusa
    // `aria-disabled`; o navegador clica sem problema.)
    const botao = page.getByTestId('botao-cancelar-venda');
    await expect(botao).toBeDisabled();
    await botao.click({ force: true });

    await expect(page.getByText(/nenhum item foi lançado/i).first()).toBeVisible();
    // E nada foi suspenso: o ERP não recebeu retrato nenhum.
    expect((await contadores(request)).faturarNFCe).toBe(0);
  });
});

test.describe('User Story 2 — suspender a venda em digitação (T026)', () => {
  test('suspender envia SUSPENDER e limpa o estado local (passo 3)', async ({ page, request }) => {
    await abrirTelaDeVenda(page);
    await biparProduto(page);

    await page.getByTestId('botao-cancelar-venda').click();

    // A confirmação é um toast do Goey (pedido do usuário, 2026-09-02), não
    // texto fixo na tela. O texto aparece duas vezes — na região `live` e no
    // corpo do toast —, daí o `.first()`.
    await expect(page.getByText(/venda suspensa/i).first()).toBeVisible();
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0);

    const { retrato } = await ultimoRetrato(request);
    expect(retrato?.SuspenderOuFaturar).toBe('SUSPENDER');

    // Suspender não emite documento fiscal.
    await expect(page.getByTestId('dialogo-documento-fiscal')).toHaveCount(0);

    const eventos: { tipo: string }[] = JSON.parse(retrato?.Log ?? '[]');
    expect(eventos.at(-1)?.tipo).toBe('VENDA_SUSPENSA');
  });

  test('mesmo fluxo de finalização no layout mobile (passo 7, AD-089)', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubarImpressoraLocal(page);
    await abrirTelaDeVenda(page);
    await biparProduto(page);

    // No layout compacto o atalho de suspender é só o ícone de lixeira, mas
    // continua acessível pelo mesmo nome (AD-089).
    await expect(page.getByTestId('botao-cancelar-venda')).toHaveAccessibleName('Cancelar venda');

    await page.getByTestId('botao-finalizar-venda').click();

    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0);
    expect((await contadores(request)).faturarNFCe).toBe(1);
  });
});
