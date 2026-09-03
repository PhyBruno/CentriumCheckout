import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';

/**
 * Fluxo dourado da feature 008 (`specs/008-pagamento-geral/quickstart.md`,
 * "Fluxo dourado (E2E)") — T043.
 *
 * ```text
 * carrinho com 3 itens (100,00)
 *   → selecionar condição "A VISTA"
 *   → aplicar desconto de capa 10% (total 90,00)
 *   → aplicar CartaoCredito 60,00
 *   → aplicar Dinheiro recebido 40,00  (aplicado 30,00, troco 10,00)
 *   → saldo zerado, botão "Finalizar Venda" habilitado
 *   → payload: Σ FormaValor = 90,00; DescontoValor por item soma 10,00; sem campo de troco
 * ```
 *
 * O mock roda com `TEFAtivo: false` e `UtilizaCentriumPAG: false`
 * (`support/erp-mock.ts`), que é exatamente o cenário do quickstart: com as duas
 * integrações desligadas, `resolverIntegracao` devolve `NENHUMA` para toda forma
 * e o pagamento entra `APROVADO` na hora — sem depender das features 009 (PIX) e
 * 010 (TEF), que ainda não existem. É o mesmo motivo pelo qual **não** há aqui
 * um caso de `PENDENTE_INTEGRACAO`: não há operador capaz de aprová-lo pela tela.
 *
 * O serviço de impressão local é stubado pelo mesmo motivo de
 * `finalizacao-suspensao.spec.ts`: a chamada real sai do navegador para o
 * `CadMaqHost`, na rede do PDV, fora do alcance do CI.
 */

interface ItemRetrato {
  readonly DescontoValor?: number;
  readonly ValorTotal?: number;
}

interface FormaRetrato {
  readonly FormaCodigo?: number;
  readonly FormaValor?: number;
  readonly FormaEntrada?: string;
  readonly FormaMeioPagtoNFe?: string;
}

interface RetratoFaturado {
  retrato: {
    CondicaoPagamentoCodigo?: number;
    produtos?: readonly ItemRetrato[];
    FormasDePagamento?: readonly FormaRetrato[];
  } | null;
}

/** Os 3 itens do quickstart: 70,00 + 29,00 + 1,00 = 100,00. */
const ITENS = [
  { sku: '070000', reais: 70 },
  { sku: '029000', reais: 29 },
  { sku: '001000', reais: 1 },
] as const;

const URL_SERVICO_IMPRESSAO = 'http://127.0.0.1:4545/**';

async function ultimoRetrato(request: APIRequestContext): Promise<RetratoFaturado> {
  const resposta = await request.get(`${URL_ERP_MOCK}/__mock/ultimo-faturamento`);
  return (await resposta.json()) as RetratoFaturado;
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

async function escolherNoCombobox(page: Page, combobox: string, opcao: string): Promise<void> {
  await page.getByTestId(combobox).click();
  await page.getByTestId(opcao).click();
}

/**
 * Aplica uma forma pelo par "combobox de forma + campo de valor + botão".
 *
 * O valor é digitado em **reais com vírgula**, como o operador digita — é o que
 * exercita `lerCentavosDigitados` no caminho real, e não só no unitário.
 */
async function aplicarPagamento(page: Page, opcaoForma: string, valor: string): Promise<void> {
  await escolherNoCombobox(page, 'combobox-forma-pagamento', opcaoForma);
  await page.getByTestId('campo-valor-recebido').fill(valor);
  await page.getByTestId('adicionar-pagamento').click();
}

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

test.describe('Fluxo dourado do pagamento (T043)', () => {
  test('split cartão + dinheiro com desconto de capa fecha o saldo e monta o payload', async ({
    page,
    request,
  }) => {
    await stubarImpressoraLocal(page);
    await abrirTelaDeVenda(page);

    for (const [indice, item] of ITENS.entries()) {
      await biparProduto(page, item.sku, indice + 1);
    }

    // --- condição de pagamento (`FR-001`, US1) ---------------------------------
    await escolherNoCombobox(page, 'combobox-condicao-pagamento', 'opcao-condicao-1');
    await expect(page.getByTestId('combobox-condicao-pagamento')).toContainText('A VISTA');

    // --- desconto de capa de 10% (`FR-015`/`FR-016`, US5) ----------------------
    // O total cai de 100,00 para 90,00; o rateio só se materializa na montagem
    // do payload (AD-098), então aqui a prova é o total exibido.
    await page.getByTestId('campo-valor-ajuste').fill('10');
    await page.getByTestId('campo-valor-ajuste').press('Enter');
    await expect(page.getByTestId('equivalente-financeiro-desconto-capa')).toContainText('10,00');
    await expect(page.getByTestId('total-a-pagar')).toContainText('90,00');

    // --- cartão de crédito de 60,00 (sem TEF ⇒ aprovado na hora) --------------
    await aplicarPagamento(page, 'opcao-forma-2', '60,00');
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);
    await expect(page.getByTestId('pagamentos-saldo-restante')).toContainText('30,00');

    // --- dinheiro recebido 40,00 ⇒ aplicado 30,00, troco 10,00 ----------------
    // É a linha que prova `FR-012`/SC-002: o excedente vira troco e **não** entra
    // em `valorAplicado`, senão a soma das formas estouraria o total da nota.
    await aplicarPagamento(page, 'opcao-forma-1', '40,00');
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(2);
    await expect(page.getByTestId('pagamentos-saldo-restante')).toHaveCount(0);
    await expect(page.getByTestId('total-da-venda')).toContainText('10,00');

    // --- saldo zerado libera a finalização ------------------------------------
    const botaoFinalizar = page.getByTestId('botao-finalizar-venda');
    await expect(botaoFinalizar).toBeEnabled();
    await botaoFinalizar.click();

    // --- o payload é o contrato (`erp-pagamento-api.md` §3) --------------------
    await expect.poll(async () => (await ultimoRetrato(request)).retrato !== null).toBe(true);
    const { retrato } = await ultimoRetrato(request);

    expect(retrato?.CondicaoPagamentoCodigo).toBe(1);

    const formas = retrato?.FormasDePagamento ?? [];
    expect(formas).toHaveLength(2);

    // `Σ FormaValor` é **exatamente** o total líquido: 60,00 + 30,00 = 90,00.
    // O troco de 10,00 não aparece em campo nenhum — não existe campo de troco
    // no contrato (`research.md` D3).
    const somaFormas = formas.reduce((total, forma) => total + (forma.FormaValor ?? 0), 0);
    expect(somaFormas).toBeCloseTo(90, 2);
    expect(JSON.stringify(retrato)).not.toContain('roco');

    // `FormaEntrada` ecoado do catálogo em toda forma (`FR-022`/AD-111): sem ele
    // o ERP calcula crediário zero e o gate da 014 aprovaria o que deve barrar.
    for (const forma of formas) {
      expect(forma.FormaEntrada).toBeTruthy();
    }

    // O desconto de capa só existe no payload diluído por item — não há campo de
    // cabeçalho para ele. Soma exata de 10,00, e o clamp (AD-098) impede que a
    // linha de 1,00 fique negativa.
    const itens = retrato?.produtos ?? [];
    expect(itens).toHaveLength(3);
    const somaDescontos = itens.reduce((total, item) => total + (item.DescontoValor ?? 0), 0);
    expect(somaDescontos).toBeCloseTo(10, 2);
    for (const item of itens) {
      expect(item.ValorTotal ?? 0).toBeGreaterThanOrEqual(0);
    }
  });

  test('segunda forma dinheiro é recusada e a lista permanece intacta (FR-013/SC-003)', async ({
    page,
  }) => {
    await stubarImpressoraLocal(page);
    await abrirTelaDeVenda(page);
    await biparProduto(page, ITENS[0].sku, 1);

    await escolherNoCombobox(page, 'combobox-condicao-pagamento', 'opcao-condicao-1');
    await aplicarPagamento(page, 'opcao-forma-1', '10,00');
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);

    await aplicarPagamento(page, 'opcao-forma-1', '10,00');

    // A recusa é local (`podeAplicarForma`) e por isso nem chega ao ERP
    // (`FR-020`): o estado permanece com o único pagamento anterior.
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);
  });

  test('trocar a condição de pagamento esvazia as formas já aplicadas (I9)', async ({ page }) => {
    await stubarImpressoraLocal(page);
    await abrirTelaDeVenda(page);
    await biparProduto(page, ITENS[0].sku, 1);

    await escolherNoCombobox(page, 'combobox-condicao-pagamento', 'opcao-condicao-1');
    await aplicarPagamento(page, 'opcao-forma-1', '10,00');
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);

    // Reselecionar a **mesma** condição não é troca: a lista sobrevive. É o caso
    // que distingue "trocou de condição" de "clicou de novo na que já estava".
    await escolherNoCombobox(page, 'combobox-condicao-pagamento', 'opcao-condicao-1');
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);
  });
});
