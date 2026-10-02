import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';

/**
 * Fluxo dourado da feature 010 (`specs/010-pagamento-tef/quickstart.md`) — T037.
 *
 * ```text
 * carrinho 10,00 → condição '2 VEZES'
 *   → débito TEF 5,00: PDT → PROC_PAG → CNC, aprovado com NSU/autorização/bandeira
 *   → crédito TEF 5,00: PagamentoParcelas 2, EmpCod/UsuarioGAM postos pelo BFF
 *   → remover o débito = estorno: SOL_EST → PROC_EST → EST, forma riscada
 *   → PIX TEF 5,00 aprovado
 *   → finalizar: dois TEFPagId distintos, nenhum campo TEF antigo
 * ```
 *
 * **Mock, não ERP.** As formas de resposta são as lidas na KB; o usuário ainda
 * não tem o terminal de homologação para medi-las (T001 adiado, AD-260), e a
 * validação ao vivo (T040) fica aberta. O polling é o de produção — 10s —, sem
 * injeção, daí os timeouts generosos.
 */

const SKU = '001234';
const URL_SERVICO_IMPRESSAO = 'http://127.0.0.1:4545/**';
const CONDICAO_DUAS_VEZES = 'opcao-condicao-3';
const FORMA_CREDITO_TEF = 'opcao-forma-11';
const FORMA_DEBITO_TEF = 'opcao-forma-12';
const FORMA_PIX_TEF = 'opcao-forma-13';
/** O `usuarioGam` padrão do mock — o que o BFF grava no cookie no `/session/start`. */
const USUARIO_GAM_DO_MOCK = '0f2c9a4e-0000-4000-8000-0000000000e2';

interface CorpoCriarCard {
  sdt: Record<string, unknown> | null;
}

interface RetratoFaturado {
  retrato: { FormasDePagamento?: Record<string, unknown>[] } | null;
}

interface Contadores {
  criarCardPagamento: number;
  estornarPagamento: number;
}

async function configurarTef(
  request: APIRequestContext,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
  // Roteiro explícito: sem ele o mock aprova pelo relógio, 30s depois da
  // criação — bom para o teste manual, lento e dependente de tempo aqui.
  await request.post(`${URL_ERP_MOCK}/__mock/config`, {
    data: { tefAtivo: true, tefStatusCobranca: ['PDT', 'PROC_PAG', 'CNC'], ...extra },
  });
}

async function abrirVendaComItem(page: Page): Promise<void> {
  await page.goto(urlSessionStart());
  await expect(page.getByTestId('tela-de-venda')).toBeVisible();
  const campo = page.getByTestId('campo-codigo-produto');
  await campo.fill(SKU);
  await campo.press('Enter');
  await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
}

async function selecionarCondicaoDuasVezes(page: Page): Promise<void> {
  await page.getByTestId('combobox-condicao-pagamento').click();
  await page.getByTestId(CONDICAO_DUAS_VEZES).click();
}

/**
 * O campo de valor se preenche com o faltante **no foco** (pedido do usuário,
 * 2026-09-24). Um `fill` direto corre contra esse preenchimento e o texto sai
 * concatenado ("10,0010,00"); por isso o campo é focado primeiro, o
 * preenchimento é esperado, e só então o valor é sobrescrito.
 */
async function aplicarForma(page: Page, forma: string, valor: string): Promise<void> {
  await page.getByTestId('combobox-forma-pagamento').click();
  await page.getByTestId(forma).click();
  const campo = page.getByTestId('campo-valor-recebido');
  await campo.click();
  await expect(campo).not.toHaveValue('');
  await campo.fill(valor);
  await expect(campo).toHaveValue(valor);
  await page.getByTestId('adicionar-pagamento').click();
}

/** Espera a aprovação (dois ticks de 10s no pior caso) e fecha a janela. */
async function esperarAprovacaoEFechar(page: Page): Promise<void> {
  await expect(page.getByTestId('tef-badge-status')).toContainText('Aprovado', {
    timeout: 40_000,
  });
  await page.getByTestId('concluir-tef').click();
  await expect(page.getByTestId('modal-tef')).toHaveCount(0);
}

async function ultimoCriarCard(request: APIRequestContext): Promise<CorpoCriarCard> {
  return (await (
    await request.get(`${URL_ERP_MOCK}/__mock/ultimo-criar-card`)
  ).json()) as CorpoCriarCard;
}

async function contadores(request: APIRequestContext): Promise<Contadores> {
  return (await (await request.get(`${URL_ERP_MOCK}/__mock/calls`)).json()) as Contadores;
}

test.describe('Fluxo dourado do TEF (T037)', () => {
  test('dois TEFs, estorno de um, e a NFCe sai só com os TEFPagId vigentes', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    await page.route(URL_SERVICO_IMPRESSAO, (rota) => rota.fulfill({ status: 200, body: '' }));

    await configurarTef(request);
    await abrirVendaComItem(page);
    await selecionarCondicaoDuasVezes(page);

    // --- débito: cenários 1 e 2 ----------------------------------------------
    await aplicarForma(page, FORMA_DEBITO_TEF, '5,00');
    await expect(page.getByTestId('modal-tef')).toBeVisible();
    await expect(page.getByTestId('tef-valor')).toContainText('5,00');

    // Com a cobrança aberta, ESC não fecha (cenário 5).
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-tef')).toBeVisible();

    await expect(page.getByTestId('tef-badge-status')).toContainText('Aprovado', {
      timeout: 40_000,
    });
    await expect(page.getByTestId('tef-nsu')).toHaveText('048291');
    await expect(page.getByTestId('tef-autorizacao')).toHaveText('192837');
    await expect(page.getByTestId('tef-bandeira')).toHaveText('MASTERCARD');
    // O saldo abate na hora do `CNC`, com a janela ainda aberta (T3).
    await expect(page.getByTestId('pagamentos-saldo-restante')).toContainText('5,00');
    await page.getByTestId('concluir-tef').click();
    await expect(page.getByTestId('modal-tef')).toHaveCount(0);

    // --- crédito: cenário 3 e o BFF (cenário 19) ------------------------------
    await aplicarForma(page, FORMA_CREDITO_TEF, '5,00');
    await esperarAprovacaoEFechar(page);

    const { sdt } = await ultimoCriarCard(request);
    expect(sdt).toEqual({
      // Postos pelo BFF a partir do cookie, nunca pelo navegador (T8).
      EmpCod: 1,
      UsuarioGAM: USUARIO_GAM_DO_MOCK,
      PagamentoValor: 5,
      PagamentoParcelas: 2,
      // Cliente default: sem documento (cenário 4).
      PagamentoCpfCliente: '',
      PagamentoNomeCliente: 'CONSUMIDOR FINAL',
      FPgCod: 11,
    });
    await expect(page.getByTestId('pagamentos-saldo-restante')).toHaveCount(0);

    // --- estorno do débito: cenários 12 e 13 ----------------------------------
    await page.getByTestId('pagamento-aplicado').nth(0).getByTestId('remover-pagamento').click();
    await expect(page.getByTestId('confirmar-estorno-tef')).toContainText(
      'Estornar o pagamento no cartão?',
    );
    await page.getByTestId('confirmar-estorno-tef-confirmar').click();

    await expect(page.getByTestId('janela-estorno-tef')).toBeVisible();
    await expect(page.getByTestId('pagamento-aplicado').nth(0)).toHaveAttribute(
      'data-status',
      'EXCLUIDO',
      { timeout: 40_000 },
    );
    await expect(page.getByTestId('janela-estorno-tef')).toHaveCount(0);
    await expect(page.getByTestId('pagamentos-saldo-restante')).toContainText('5,00');

    // --- PIX pelo TEF e finalização: cenário 10 --------------------------------
    await aplicarForma(page, FORMA_PIX_TEF, '5,00');
    await esperarAprovacaoEFechar(page);

    await page.getByTestId('botao-finalizar-venda').click();
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0, { timeout: 30_000 });

    const { retrato } = (await (
      await request.get(`${URL_ERP_MOCK}/__mock/ultimo-faturamento`)
    ).json()) as RetratoFaturado;
    const formas = retrato?.FormasDePagamento ?? [];
    // O débito estornado ficou fora: `EXCLUIDO` não vai ao ERP.
    expect(formas).toHaveLength(2);
    const pagIds = formas.map((forma) => forma['TEFPagId']);
    expect(new Set(pagIds).size).toBe(2);
    for (const forma of formas) {
      expect(forma['TEFPagId']).toMatch(/^pay_mock_/);
      expect(forma['TEFTipoIntegracao']).toBe('1');
      expect(forma).not.toHaveProperty('TEFidentificacao');
      expect(forma).not.toHaveProperty('TEFCNPJ');
      expect(forma).not.toHaveProperty('TEFNumeroAutorizacao');
    }
    expect((await contadores(request)).estornarPagamento).toBe(1);
  });

  // Cenário 6: o Checkout não cancela a transação em voo, e diz isso.
  test('desistir da cobrança avisa que a transação em voo não é cancelada', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);
    await configurarTef(request, { tefStatusCobranca: ['PDT'] });
    await abrirVendaComItem(page);
    await selecionarCondicaoDuasVezes(page);

    await aplicarForma(page, FORMA_DEBITO_TEF, '10,00');
    await expect(page.getByText('Aguardando retorno do TEF')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('desistir-operacao-tef').click();
    await expect(page.getByTestId('confirmar-desistencia-tef')).toContainText(
      'não cancela automaticamente a transação em voo',
    );
    await page.getByTestId('confirmar-desistencia-tef-confirmar').click();

    await expect(page.getByTestId('modal-tef')).toHaveCount(0);
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);
    expect((await contadores(request)).estornarPagamento).toBe(0);
  });

  // Cenário 14: estorno rejeitado mantém o TEF aprovado na venda (T6).
  test('estorno rejeitado mantém o TEF aprovado', async ({ page, request }) => {
    test.setTimeout(120_000);
    await configurarTef(request, { tefStatusEstorno: ['SOL_EST', 'REJ_EST'] });
    await abrirVendaComItem(page);
    await selecionarCondicaoDuasVezes(page);

    await aplicarForma(page, FORMA_DEBITO_TEF, '10,00');
    await esperarAprovacaoEFechar(page);

    await page.getByTestId('remover-pagamento').click();
    await page.getByTestId('confirmar-estorno-tef-confirmar').click();

    await expect(page.getByTestId('estorno-rejeitado-tef')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('concluir-estorno-tef').click();

    await expect(page.getByTestId('janela-estorno-tef')).toHaveCount(0);
    await expect(page.getByTestId('pagamento-aplicado')).toHaveAttribute('data-status', 'APROVADO');
  });
});

/**
 * O mock no padrão (pedido do usuário, 2026-10-02): TEF ligado, sem roteiro, e
 * a maquininha "aprova" 30s depois de a cobrança ser criada — o que o teste
 * manual na stack local enxerga. Só `reset`, nenhuma configuração.
 */
test.describe('TEF no mock padrão — aprovação pelo relógio', () => {
  test('a cobrança fica pendente e é aprovada depois de 30s', async ({ page, request }) => {
    test.setTimeout(120_000);
    await request.post(`${URL_ERP_MOCK}/__mock/reset`);
    await abrirVendaComItem(page);
    await selecionarCondicaoDuasVezes(page);

    await aplicarForma(page, FORMA_DEBITO_TEF, '10,00');
    const criadaEm = Date.now();
    await expect(page.getByText('Aguardando retorno do TEF')).toBeVisible({ timeout: 15_000 });

    // Ainda pendente bem antes dos 30s.
    await page.waitForTimeout(Math.max(0, 20_000 - (Date.now() - criadaEm)));
    await expect(page.getByTestId('tef-badge-status')).toContainText('Processando');

    // O primeiro tick de 10s depois dos 30s aprova.
    await expect(page.getByTestId('tef-badge-status')).toContainText('Aprovado', {
      timeout: 30_000,
    });
    expect(Date.now() - criadaEm).toBeGreaterThanOrEqual(30_000);
  });
});

/** Cenário 18: mesma regra no wizard do celular, sem ramificação (AD-144). */
test.describe('TEF no layout mobile (cenário 18)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('cobra no TEF na etapa 2 e estorna pela mesma lista', async ({ page, request }) => {
    test.setTimeout(150_000);
    await configurarTef(request);
    await page.goto(urlSessionStart());
    await expect(page.getByTestId('etapa-cliente-produtos')).toBeVisible();

    const campo = page.getByTestId('campo-codigo-produto');
    await campo.fill(SKU);
    await campo.press('Enter');
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    await page.getByTestId('wizard-avancar').click();
    await expect(page.getByTestId('etapa-pagamento')).toBeVisible();

    await selecionarCondicaoDuasVezes(page);
    await aplicarForma(page, FORMA_DEBITO_TEF, '10,00');
    await esperarAprovacaoEFechar(page);
    await expect(page.getByTestId('pagamento-aplicado')).toHaveAttribute('data-status', 'APROVADO');

    await page.getByTestId('remover-pagamento').click();
    await page.getByTestId('confirmar-estorno-tef-confirmar').click();
    await expect(page.getByTestId('pagamento-aplicado')).toHaveAttribute(
      'data-status',
      'EXCLUIDO',
      {
        timeout: 40_000,
      },
    );
  });
});
