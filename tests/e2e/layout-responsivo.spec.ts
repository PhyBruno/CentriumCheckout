import { expect, test } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';

/**
 * T013 — `quickstart.md` §2 / `SC-003`: redimensionar cruzando o limiar de 768px
 * com o carrinho populado não perde nem duplica a venda.
 *
 * O critério de aprovação do quickstart é literal: **o total antes e depois da
 * troca é idêntico**. Um total igual com uma linha a mais seria coincidência
 * aritmética, então a contagem de linhas entra junto — é a metade "não duplica"
 * do requisito, e é a que uma remontagem de árvore quebraria primeiro.
 *
 * O redimensionamento é o gesto real: `useIsMobile` escuta `matchMedia`, então
 * mudar o viewport dispara a troca sem nenhum gancho de teste no meio.
 */
const ITENS = [
  { sku: '070000', reais: 70 },
  { sku: '029000', reais: 29 },
] as const;

const VIEWPORT_DESKTOP = { width: 1440, height: 900 };
/** 390px: a largura do frame mobile do Pencil, bem abaixo dos 768. */
const VIEWPORT_MOBILE = { width: 390, height: 844 };

test.use({ viewport: VIEWPORT_DESKTOP });

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

test.describe('Alternância de layout com venda em andamento', () => {
  test('cruzar o breakpoint de ida e volta preserva itens e total (SC-003)', async ({ page }) => {
    await page.goto(urlSessionStart());
    await expect(page.getByTestId('painel-pagamento-totais')).toBeVisible();

    for (const [indice, item] of ITENS.entries()) {
      const campo = page.getByTestId('campo-codigo-produto');
      await campo.fill(item.sku);
      await campo.press('Enter');
      await expect(page.getByTestId('linha-carrinho')).toHaveCount(indice + 1);
    }

    const totalNoDesktop = (await page.getByTestId('total-a-pagar').innerText()).trim();
    expect(totalNoDesktop).toContain('99,00');

    // --- desktop → mobile ----------------------------------------------------
    await page.setViewportSize(VIEWPORT_MOBILE);
    await expect(page.getByTestId('mobile-wizard')).toBeVisible();
    await expect(page.getByTestId('painel-pagamento-totais')).toHaveCount(0);
    // A etapa reinicia em 1 (I1) — é o trade-off aceito em `research.md` D2: o
    // que a spec exige preservar é o estado da **venda**, não a posição do
    // wizard.
    await expect(page.getByTestId('indicador-etapa')).toContainText('1/3');

    await expect(page.getByTestId('linha-carrinho')).toHaveCount(ITENS.length);
    expect((await page.getByTestId('total-a-pagar').innerText()).trim()).toBe(totalNoDesktop);

    // --- mobile → desktop ----------------------------------------------------
    await page.setViewportSize(VIEWPORT_DESKTOP);
    await expect(page.getByTestId('painel-pagamento-totais')).toBeVisible();
    await expect(page.getByTestId('mobile-wizard')).toHaveCount(0);

    await expect(page.getByTestId('linha-carrinho')).toHaveCount(ITENS.length);
    expect((await page.getByTestId('total-a-pagar').innerText()).trim()).toBe(totalNoDesktop);
  });

  test('o cliente identificado sobrevive à travessia do breakpoint (FR-002)', async ({ page }) => {
    await page.goto(urlSessionStart());
    await expect(page.getByTestId('painel-pagamento-totais')).toBeVisible();

    const nomeNoDesktop = (await page.getByTestId('nome-vendedor').innerText()).trim();

    await page.setViewportSize(VIEWPORT_MOBILE);
    await expect(page.getByTestId('mobile-wizard')).toBeVisible();

    // O campo de vendedor vive dentro do card de cliente, montado igual nas duas
    // árvores: mesmo componente, mesmo store, mesmo rótulo.
    expect((await page.getByTestId('nome-vendedor').innerText()).trim()).toBe(nomeNoDesktop);
  });
});
