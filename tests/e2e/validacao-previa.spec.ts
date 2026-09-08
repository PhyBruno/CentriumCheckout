import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';
import {
  MENSAGEM_AVISO_LIMITE_CREDITO,
  MENSAGEM_RECUSA_CREDITO_BLOQUEADO,
} from './support/erp-mock';

/**
 * Validação prévia da venda no ERP, ponta a ponta (feature 014 — T015/T020,
 * `specs/014-validacao-previa-nfce/quickstart.md`, Cenários 1, 2, 3, 4, 5 e 6).
 *
 * O gate roda em **toda** inserção de pagamento, então o mock responde
 * `ACEITA` por padrão (`support/erp-mock.ts`) e cada cenário aqui muda o
 * veredito explicitamente antes de agir.
 *
 * **Cobertura mobile (`FR-019`) não é exercitada aqui, e isto é achado, não
 * omissão**: `tasks.md` T020 previa repetir o cenário do atalho com viewport
 * compacta, mas no layout mobile a feature 013 não registra atalho nenhum
 * (`FR-020`/C10 daquela feature, `venda-rapida.spec.ts`) e a 007 ainda não monta
 * o cartão "Pagamento e totais" no compacto — não há, hoje, nenhum caminho de
 * inserção de pagamento em mobile para o gate cobrir. A paridade fica verificada
 * por construção (o gate mora no slice, que é o mesmo nas duas plataformas) e
 * volta a ser testável quando a 007 montar o wizard de pagamento.
 */

const SKU = '070000';
const URL_SERVICO_IMPRESSAO = 'http://127.0.0.1:4545/**';

/** `SC-006`: da confirmação da inserção ao desfecho visível. */
const LIMITE_DESFECHO_MS = 2_000;

interface ContadoresMock {
  readonly validarNFCe: number;
  readonly faturarNFCe: number;
}

async function contadores(request: APIRequestContext): Promise<ContadoresMock> {
  const resposta = await request.get(`${URL_ERP_MOCK}/__mock/calls`);
  return (await resposta.json()) as ContadoresMock;
}

async function configurarVeredito(
  request: APIRequestContext,
  config: Record<string, unknown>,
): Promise<void> {
  await request.post(`${URL_ERP_MOCK}/__mock/config`, { data: config });
}

async function stubarImpressoraLocal(page: Page): Promise<void> {
  await page.route(URL_SERVICO_IMPRESSAO, (rota) => rota.fulfill({ status: 200, body: '' }));
}

async function abrirTelaDeVenda(page: Page): Promise<void> {
  await page.goto(urlSessionStart());
  await expect(page.getByTestId('tela-de-venda')).toBeVisible();
  await expect(page.getByTestId('painel-pagamento-totais')).toBeVisible();
}

async function biparProduto(page: Page, sku: string, linhasEsperadas: number): Promise<void> {
  const campo = page.getByTestId('campo-codigo-produto');
  await campo.fill(sku);
  await campo.press('Enter');
  await expect(page.getByTestId('linha-carrinho')).toHaveCount(linhasEsperadas);
}

async function escolherCondicao(page: Page): Promise<void> {
  await page.getByTestId('combobox-condicao-pagamento').click();
  await page.getByTestId('opcao-condicao-1').click();
}

async function aplicarDinheiro(page: Page, valor: string): Promise<void> {
  await page.getByTestId('combobox-forma-pagamento').click();
  await page.getByTestId('opcao-forma-1').click();
  await page.getByTestId('campo-valor-recebido').fill(valor);
  await page.getByTestId('adicionar-pagamento').click();
}

async function soltarOFoco(page: Page): Promise<void> {
  await page.getByTestId('tela-de-venda').click({ position: { x: 5, y: 5 } });
}

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

/* ------------------------------------------------------------------ *
 * US1 — Cenário 1: a recusa impede a inserção (T015)
 * ------------------------------------------------------------------ */

test.describe('Recusa do ERP bloqueia a inserção (Cenário 1, T015)', () => {
  test('mostra o motivo do ERP íntegro, não aplica o pagamento e trava a finalização', async ({
    page,
    request,
  }) => {
    await configurarVeredito(request, { vereditoValidarNFCe: 'RECUSADA' });
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);
    await escolherCondicao(page);

    const inicio = Date.now();
    await aplicarDinheiro(page, '70,00');

    // Texto **do ERP**, sem reescrita (`FR-007`, I11).
    await expect(page.getByText(MENSAGEM_RECUSA_CREDITO_BLOQUEADO).first()).toBeVisible();
    const decorrido = Date.now() - inicio;

    // `SC-006`: da confirmação ao desfecho visível, menos de 2s.
    expect(decorrido).toBeLessThan(LIMITE_DESFECHO_MS);

    // Venda intacta: nenhum pagamento aplicado e o total a pagar inalterado.
    // (`pagamentos-saldo-restante` não serve de prova aqui — ele só é montado
    // depois que existe alguma forma aplicada.)
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);
    await expect(page.getByTestId('total-a-pagar')).toContainText('70,00');

    // O gate foi consultado uma vez, e nada foi emitido (`FR-015`).
    const chamadas = await contadores(request);
    expect(chamadas.validarNFCe).toBe(1);
    expect(chamadas.faturarNFCe).toBe(0);
  });

  test('corrigida a causa, a nova tentativa consulta de novo e é aceita (Cenário 2)', async ({
    page,
    request,
  }) => {
    await configurarVeredito(request, { vereditoValidarNFCe: 'RECUSADA' });
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);
    await escolherCondicao(page);

    await aplicarDinheiro(page, '70,00');
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);

    // O "operador corrige a causa no ERP" — aqui, o cadastro do cliente deixa
    // de bloquear. O veredito anterior **não** é reaproveitado.
    await configurarVeredito(request, { vereditoValidarNFCe: 'ACEITA' });
    await aplicarDinheiro(page, '70,00');

    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);
    await expect(page.getByTestId('pagamentos-saldo-restante')).toHaveCount(0);

    const chamadas = await contadores(request);
    expect(chamadas.validarNFCe).toBe(2);
  });
});

/* ------------------------------------------------------------------ *
 * US2 — Cenários 2 e 3: aviso não bloqueia; severidade não decide
 * ------------------------------------------------------------------ */

test.describe('Aviso não bloqueia e severidade não decide (Cenários 2 e 3)', () => {
  test('Valido=true com Warning aplica o pagamento e mostra o aviso', async ({ page, request }) => {
    await configurarVeredito(request, { vereditoValidarNFCe: 'ACEITA_COM_AVISO' });
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);
    await escolherCondicao(page);

    await aplicarDinheiro(page, '70,00');

    await expect(page.getByText(MENSAGEM_AVISO_LIMITE_CREDITO).first()).toBeVisible();
    // O aviso não interrompe: o pagamento entrou e o saldo fechou.
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);
    await expect(page.getByTestId('pagamentos-saldo-restante')).toHaveCount(0);
  });

  test('Valido=false com Warning RECUSA — a armadilha de AD-110, ponta a ponta', async ({
    page,
    request,
  }) => {
    await configurarVeredito(request, { vereditoValidarNFCe: 'RECUSADA_WARNING' });
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);
    await escolherCondicao(page);

    await aplicarDinheiro(page, '70,00');

    // Mesma severidade do caso acima, desfecho oposto: quem decide é `Valido`.
    await expect(page.getByText(MENSAGEM_RECUSA_CREDITO_BLOQUEADO).first()).toBeVisible();
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------ *
 * Cenário 4 — ERP indisponível
 * ------------------------------------------------------------------ */

test.describe('ERP indisponível (Cenário 4, FR-009)', () => {
  test('não aplica o pagamento e a mensagem é distinta da recusa de negócio', async ({
    page,
    request,
  }) => {
    await configurarVeredito(request, { statusValidarNFCe: 500 });
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);
    await escolherCondicao(page);

    await aplicarDinheiro(page, '70,00');

    // A frase de indisponibilidade convida a tentar de novo; a de recusa manda
    // revisar a venda. Confundi-las faria o operador procurar um problema no
    // cliente que não existe.
    await expect(page.getByText(/não conseguiu validar a venda/i).first()).toBeVisible();
    await expect(page.getByText(MENSAGEM_RECUSA_CREDITO_BLOQUEADO)).toHaveCount(0);
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);

    // Sem retentativa automática (`research.md` D5): uma tentativa, um desfecho.
    const chamadas = await contadores(request);
    expect(chamadas.validarNFCe).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * US3 — Cenários 5 e 6: o atalho passa pelo mesmo gate (T020)
 * ------------------------------------------------------------------ */

test.describe('O atalho de venda rápida não contorna o gate (Cenários 5 e 6, T020)', () => {
  test('F6 numa venda recusada não lança pagamento nem inicia a finalização automática', async ({
    page,
    request,
  }) => {
    await stubarImpressoraLocal(page);
    await configurarVeredito(request, { vereditoValidarNFCe: 'RECUSADA' });
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);
    await soltarOFoco(page);

    await page.keyboard.press('F6');

    // Notificação idêntica à do caminho manual — é o mesmo gate, com o mesmo
    // texto do ERP.
    await expect(page.getByText(MENSAGEM_RECUSA_CREDITO_BLOQUEADO).first()).toBeVisible();
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);
    // "Encerra a operação" está ligado neste cenário: a recusa aborta o
    // encadeamento **antes** da emissão (`FR-010`, I9).
    await expect(page.getByTestId('dialogo-documento-fiscal')).toHaveCount(0);

    const chamadas = await contadores(request);
    expect(chamadas.validarNFCe).toBe(1);
    expect(chamadas.faturarNFCe).toBe(0);
  });

  test('F6 duas vezes em sequência rápida faz uma consulta só (FR-011, I8)', async ({
    page,
    request,
  }) => {
    await stubarImpressoraLocal(page);
    await configurarVeredito(request, { vereditoValidarNFCe: 'RECUSADA' });
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);
    await soltarOFoco(page);

    await page.keyboard.press('F6');
    await page.keyboard.press('F6');

    await expect(page.getByText(MENSAGEM_RECUSA_CREDITO_BLOQUEADO).first()).toBeVisible();
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);

    const chamadas = await contadores(request);
    expect(chamadas.validarNFCe).toBe(1);
  });
});
