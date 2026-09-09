import { expect, test } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';

/**
 * T013 — `quickstart.md` §2 / `SC-003`: redimensionar cruzando o piso de 1024px
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
/** 390px: a largura do frame mobile do Pencil, bem abaixo do piso de 1024. */
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

/**
 * AD-198 no navegador: **quem escolhe o layout é o toque, não o pixel.**
 *
 * Os testes acima cruzam o piso de 1024px, então provam só a metade do critério
 * que já valia antes. A metade nova — largura de sobra e nenhum ponteiro preciso
 * — não tem como ser verificada em unitário: `classificarLayout.spec.ts` cobre a
 * função pura, mas ninguém confere que `CONSULTA_LAYOUT_COMPACTO`, a **string**
 * de media query derivada dela, diz a mesma coisa ao navegador. Essa equivalência
 * é a costura entre o domínio e o CSS, e é justamente onde um `or`/`and` trocado
 * passaria despercebido (revisão da 007, 2026-09-09).
 *
 * `hasTouch: true` é o que o Chromium expõe como "sem ponteiro fino": medido
 * neste projeto em 1366×1024 — `any-pointer: fine` deixa de casar, `coarse`
 * passa a casar, e a consulta do compacto vira verdadeira. É o iPad Pro 12.9
 * deitado, o aparelho concreto que motivou AD-198.
 */
test.describe('Tablet sem mouse: largura de sobra, layout compacto (AD-198)', () => {
  /** 1366px é maior que o piso de 1024 — só o toque pode decidir aqui. */
  test.use({ viewport: { width: 1366, height: 1024 }, hasTouch: true });

  test('a tela em etapas monta num tablet largo operado só com o dedo', async ({ page }) => {
    await page.goto(urlSessionStart());

    await expect(page.getByTestId('mobile-wizard')).toBeVisible();
    await expect(page.getByTestId('painel-pagamento-totais')).toHaveCount(0);
    // A barra superior é do desktop; sua ausência prova que não é só o CSS que
    // mudou — a árvore montada é outra (`FR-008`, montagem condicional).
    await expect(page.getByTestId('barra-superior')).toHaveCount(0);
    await expect(page.getByTestId('cabecalho-mobile')).toBeVisible();
  });

  test('o `data-layout` do documento acompanha, para o CSS não se vestir de desktop', async ({
    page,
  }) => {
    await page.goto(urlSessionStart());
    await expect(page.getByTestId('mobile-wizard')).toBeVisible();

    // `sincronizarLayoutNoDocumento` é o que faz `md:` valer como "estou no
    // desktop". Se ele divergisse de `useIsMobile`, o wizard apareceria com o
    // estilo da tela única por cima — o defeito que AD-198 fecha.
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'MOBILE');
  });
});

test.describe('Desktop largo com mouse continua na tela única (AD-198)', () => {
  test.use({ viewport: { width: 1366, height: 1024 }, hasTouch: false });

  test('a mesma largura, agora com ponteiro preciso, monta a tela única', async ({ page }) => {
    await page.goto(urlSessionStart());

    // Mesmo viewport do describe anterior: o que muda é só o ponteiro. É o par
    // que torna o teste uma afirmação sobre o critério, e não sobre a largura.
    await expect(page.getByTestId('painel-pagamento-totais')).toBeVisible();
    await expect(page.getByTestId('mobile-wizard')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'DESKTOP');
  });
});
