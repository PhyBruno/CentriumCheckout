import { expect, test, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';
import { quitarVendaEmDinheiro } from './support/pagamento';

/**
 * T013 — fluxo dourado do desktop em viewport larga (feature 007, `US1`).
 *
 * A tela única continua sendo a tela única depois da extração de `App.tsx` para
 * `DesktopLayout`: mesma barra superior, mesma coluna de produtos, mesmo cartão
 * de pagamento, mesmos atalhos da venda. Este spec existe justamente porque a
 * 007 mexeu na raiz de composição — uma regressão ali derrubaria todas as
 * features de uma vez, e nenhum spec anterior afirma a **forma** da tela.
 *
 * O serviço de impressão local é stubado pelo mesmo motivo dos demais E2E: a
 * chamada real sai do navegador para o `CadMaqHost`, na rede do PDV.
 */
const URL_SERVICO_IMPRESSAO = 'http://127.0.0.1:4545/**';

/** Produto de 70,00 do mock, o mesmo de `pagamento-geral.spec.ts`. */
const SKU = '070000';

test.use({ viewport: { width: 1440, height: 900 } });

async function stubarImpressoraLocal(page: Page): Promise<void> {
  await page.route(URL_SERVICO_IMPRESSAO, (rota) => rota.fulfill({ status: 200, body: '' }));
}

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

test.describe('Layout desktop (viewport larga)', () => {
  test('monta a tela única, sem nenhum vestígio do wizard mobile', async ({ page }) => {
    await page.goto(urlSessionStart());

    await expect(page.getByTestId('tela-de-venda')).toBeVisible();
    await expect(page.getByTestId('barra-superior')).toBeVisible();
    await expect(page.getByTestId('painel-pagamento-totais')).toBeVisible();
    await expect(page.getByTestId('atalhos-venda')).toBeVisible();
    // Ausência estrutural: o wizard não está oculto, não existe.
    await expect(page.getByTestId('mobile-wizard')).toHaveCount(0);
    await expect(page.getByTestId('indicador-etapa')).toHaveCount(0);
  });

  test('fluxo dourado: bipar, quitar e finalizar sem sair da mesma tela', async ({ page }) => {
    await stubarImpressoraLocal(page);
    await page.goto(urlSessionStart());
    await expect(page.getByTestId('painel-pagamento-totais')).toBeVisible();

    const campo = page.getByTestId('campo-codigo-produto');
    await campo.fill(SKU);
    await campo.press('Enter');
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    await quitarVendaEmDinheiro(page);

    const botaoFinalizar = page.getByTestId('botao-finalizar-venda');
    await expect(botaoFinalizar).toBeEnabled();
    await botaoFinalizar.click();

    // Caminho feliz não tem modal (pedido do usuário, 2026-09-02): o cupom sai
    // na impressora e a tela volta para a próxima venda. O sinal observável é o
    // carrinho zerado — e ele continua sendo o mesmo depois da 007, porque quem
    // finaliza é o mesmo `AcoesFinaisVenda` das duas árvores.
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0);
    await expect(page.getByTestId('dialogo-documento-fiscal')).toHaveCount(0);
  });
});
