import { expect, test, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';
import { quitarVendaEmDinheiro } from './support/pagamento';

/**
 * T020 — fluxo dourado do mobile (feature 007, `US2`): entrar, etapa 1 → 2 → 3,
 * finalizar.
 *
 * Viewport de 390×844 (a mesma largura do frame `IQloN` do Pencil), abaixo do
 * limiar de 768px — é a largura que decide o layout, nunca a capacidade de
 * toque do aparelho.
 *
 * O pagamento usa o **mesmo** helper do desktop (`quitarVendaEmDinheiro`), sem
 * uma linha de adaptação: é a prova prática de `FR-009`/`SC-001` — os testids
 * que ele procura são os do painel de pagamento da 008, montado inteiro dentro
 * da etapa 2.
 */
const URL_SERVICO_IMPRESSAO = 'http://127.0.0.1:4545/**';

const SKU = '070000';

test.use({ viewport: { width: 390, height: 844 } });

async function stubarImpressoraLocal(page: Page): Promise<void> {
  await page.route(URL_SERVICO_IMPRESSAO, (rota) => rota.fulfill({ status: 200, body: '' }));
}

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

test.describe('Layout mobile (wizard de 3 etapas)', () => {
  test('monta o wizard na etapa 1, sem a tela única nem os fluxos de desktop', async ({ page }) => {
    await page.goto(urlSessionStart());

    await expect(page.getByTestId('mobile-wizard')).toBeVisible();
    await expect(page.getByTestId('indicador-etapa')).toContainText('1/3');
    await expect(page.getByTestId('etapa-cliente-produtos')).toBeVisible();

    // `FR-008`/`FR-010`: importação de documento e retaguarda não existem aqui.
    await expect(page.getByTestId('painel-pagamento-totais')).toHaveCount(0);
    await expect(page.getByTestId('atalhos-venda')).toHaveCount(0);
    await expect(page.getByTestId('botao-menu-importacao')).toHaveCount(0);

    // O cancelamento da venda mora no cabeçalho (AD-089).
    await expect(
      page.getByTestId('cabecalho-mobile').getByTestId('botao-cancelar-venda'),
    ).toBeVisible();
  });

  test('fluxo dourado: bipar na etapa 1, pagar na 2, finalizar na 3', async ({ page }) => {
    await stubarImpressoraLocal(page);
    await page.goto(urlSessionStart());
    await expect(page.getByTestId('etapa-cliente-produtos')).toBeVisible();

    // --- etapa 1: produto ----------------------------------------------------
    const campo = page.getByTestId('campo-codigo-produto');
    await campo.fill(SKU);
    await campo.press('Enter');
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    // --- etapa 2: pagamento --------------------------------------------------
    await page.getByTestId('wizard-avancar').click();
    await expect(page.getByTestId('etapa-pagamento')).toBeVisible();
    await expect(page.getByTestId('indicador-etapa')).toContainText('2/3');

    await quitarVendaEmDinheiro(page);

    // --- etapa 3: revisão e finalização --------------------------------------
    await page.getByTestId('wizard-avancar').click();
    await expect(page.getByTestId('etapa-revisao')).toBeVisible();
    await expect(page.getByTestId('indicador-etapa')).toContainText('3/3');
    await expect(page.getByTestId('conferencia-produtos')).toContainText('1 item');

    const botaoFinalizar = page.getByTestId('botao-finalizar-venda');
    await expect(botaoFinalizar).toBeEnabled();
    await botaoFinalizar.click();

    // Caminho feliz não tem modal (pedido do usuário, 2026-09-02): o sinal é o
    // carrinho zerado. O wizard volta à etapa 1 pelo mesmo motivo — a venda
    // nova começa do começo.
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0);
    await expect(page.getByTestId('dialogo-documento-fiscal')).toHaveCount(0);
  });

  test('volta livremente a uma etapa já visitada e a alteração chega na revisão', async ({
    page,
  }) => {
    await page.goto(urlSessionStart());

    const campo = page.getByTestId('campo-codigo-produto');
    await campo.fill(SKU);
    await campo.press('Enter');
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    await page.getByTestId('wizard-avancar').click();
    await page.getByTestId('wizard-avancar').click();
    await expect(page.getByTestId('conferencia-produtos')).toContainText('1 item');

    // Salto direto da etapa 3 para a 1 pela barra de progresso (`FR-004`).
    await page.getByTestId('ir-para-etapa-1').click();
    await expect(page.getByTestId('etapa-cliente-produtos')).toBeVisible();

    const campoDeVolta = page.getByTestId('campo-codigo-produto');
    await campoDeVolta.fill('029000');
    await campoDeVolta.press('Enter');
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(2);

    await page.getByTestId('ir-para-etapa-3').click();
    await expect(page.getByTestId('conferencia-produtos')).toContainText('2 itens');
  });
});
