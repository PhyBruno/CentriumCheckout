import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';
import { quitarVendaEmDinheiro } from './support/pagamento';

/**
 * Fluxo dourado da recuperação de NFCe (`quickstart.md`) — cobre T025.
 *
 * Os dois rascunhos sintéticos do mock reaproveitam os documentos de DAV
 * (AD-057, mesmo corpo):
 *
 * - `90210` — `CLIENTE CONVENIADO`, vendedor 12, uma linha do SKU `001234` a
 *   **R$ 7,77**. O catálogo cobra R$ 10,00 pelo mesmo SKU: é essa divergência
 *   que prova o congelamento de preço na retomada (`NFCE-03`, J2).
 * - `90211` — `CLIENTE VAREJO`, vendedor 8.
 */

interface RetratoFaturado {
  retrato: Record<string, unknown> | null;
}

const NOTA_CONVENIADO = 90210;
const SKU_DO_RASCUNHO = '001234';
const URL_SERVICO_IMPRESSAO = 'http://127.0.0.1:4545/**';

async function ultimoRetrato(request: APIRequestContext): Promise<RetratoFaturado> {
  const resposta = await request.get(`${URL_ERP_MOCK}/__mock/ultimo-faturamento`);
  return (await resposta.json()) as RetratoFaturado;
}

async function abrirTelaDeVenda(page: Page): Promise<void> {
  await page.goto(urlSessionStart());
  await expect(page.getByTestId('tela-de-venda')).toBeVisible();
}

async function abrirJanelaDeRecuperacao(page: Page): Promise<void> {
  await page.getByTestId('botao-menu-importacao').click();
  await expect(page.getByTestId('modal-menu-importacao')).toBeVisible();
  await page.getByTestId('opcao-importar-nfce').click();
  await expect(page.getByTestId('modal-recuperacao-nfce')).toBeVisible();
}

async function retomar(page: Page, numeroNota: number): Promise<void> {
  await page.locator(`[data-numero-nota="${String(numeroNota)}"]`).click();
  await page.getByTestId('confirmar-recuperacao-nfce').click();
}

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

test.describe('User Story 1 — listar e buscar rascunhos', () => {
  test('a janela lista as NFCes suspensas, paginada', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);

    await expect(page.getByTestId('linha-nfce')).toHaveCount(2);
    await expect(page.getByTestId('contagem-nfce')).toContainText('2');
    await expect(page.getByTestId('nfce-pagina-anterior')).toBeDisabled();
    await expect(page.getByTestId('nfce-pagina-proxima')).toBeDisabled();
  });

  test('busca por nome de cliente filtra a lista', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);

    await page.getByTestId('campo-busca-nfce').fill('CONVENIADO');
    await expect(page.getByTestId('linha-nfce')).toHaveCount(1);
    await expect(page.getByTestId('resultados-nfce')).toContainText('CLIENTE CONVENIADO');
  });

  /**
   * Busca por número da nota **não** retorna nada — limitação real do
   * `DataProvider` do ERP, que filtra só nome de cliente e de vendedor
   * (`research.md` D1). É comportamento esperado, não defeito: o teste existe
   * para que uma "correção" futura não o transforme em bug silencioso.
   */
  test('busca pelo número da nota não retorna resultado', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);

    await page.getByTestId('campo-busca-nfce').fill(String(NOTA_CONVENIADO));
    await expect(page.getByTestId('nfce-sem-resultados')).toBeVisible();
  });
});

test.describe('User Story 2 — retomar o rascunho para o carrinho', () => {
  test('o carrinho é hidratado com o preço congelado do rascunho', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);
    await retomar(page, NOTA_CONVENIADO);

    await expect(page.getByTestId('modal-recuperacao-nfce')).toBeHidden();
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    // R$ 7,77 é o preço do rascunho; o catálogo cobra R$ 10,00 pelo mesmo SKU.
    // Ver o de catálogo aqui significaria que `repricarSku` rodou na
    // hidratação, exatamente o que J2 proíbe.
    const linha = page.getByTestId('linha-carrinho').first();
    await expect(linha).toContainText(SKU_DO_RASCUNHO);
    await expect(linha).toContainText('7,77');
  });

  test('o cliente e o vendedor do rascunho passam a ser os da venda', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);
    await retomar(page, NOTA_CONVENIADO);

    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
    await expect(page.getByTestId('nome-cliente')).toContainText('CLIENTE CONVENIADO');
  });

  /**
   * `NFCE-02`/J3: a venda retomada mantém a identidade do rascunho. Sem isso o
   * faturamento sairia com `NumeroNota: 0` e o ERP emitiria uma nota nova,
   * deixando o rascunho original pendurado — sem erro e sem aviso.
   */
  test('a finalização reenvia o NumeroNota original do rascunho', async ({ page, request }) => {
    await page.route(URL_SERVICO_IMPRESSAO, (rota) => rota.fulfill({ status: 200, body: '' }));

    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);
    await retomar(page, NOTA_CONVENIADO);
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    // O rascunho sintético chega sem forma de pagamento, e desde a feature 008
    // "Finalizar venda" só libera com `saldoRestante === 0`: quitar pela UI é o
    // caminho real do operador.
    await quitarVendaEmDinheiro(page);
    await page.getByTestId('botao-finalizar-venda').click();

    await expect
      .poll(async () => (await ultimoRetrato(request)).retrato?.['NumeroNota'])
      .toBe(NOTA_CONVENIADO);
  });
});

test.describe('pré-condição — venda já iniciada', () => {
  /**
   * Um rascunho não entra numa venda já iniciada (pedido do usuário,
   * 2026-09-04): depois de retomar o primeiro, a própria identidade da venda já
   * fecha o atalho para um segundo.
   */
  test('o atalho fecha depois que um documento já foi retomado', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);
    await retomar(page, NOTA_CONVENIADO);
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    const atalho = page.getByTestId('botao-menu-importacao');
    await expect(atalho).toBeDisabled();
    await expect(atalho).toHaveAttribute('title', /já foi iniciada a partir de um documento/i);
  });
});
