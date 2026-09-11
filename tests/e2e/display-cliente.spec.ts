import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';

/**
 * Display do cliente (feature 015) — T041, `quickstart.md` Cenários 1 e 2.
 *
 * ```text
 * aba de checkout: item 10,00 → PIX → QR Code na tela do operador
 *   → aba de display aberta DEPOIS, no mesmo contexto de browser
 *   → handshake traz a cobrança em curso, sem ação adicional
 * ```
 *
 * **Duas páginas no mesmo `context`**, e isso é requisito, não conveniência: o
 * `BroadcastChannel` só atravessa contextos de execução da **mesma origem no
 * mesmo navegador**. Duas `browserContext` separadas não se ouvem, e o teste
 * falharia por um motivo que não tem nada a ver com a feature.
 *
 * É o único lugar em que o canal é o de verdade: nos testes unitários e de
 * integração ele é injetado (`deps.criarCanal`, research D13), justamente para
 * não depender do jsdom, que não implementa `BroadcastChannel`.
 *
 * **Antes de crer em qualquer falha aqui, derrubar o que estiver na porta
 * 3100.** Uma stack antiga do `erp-mock` já produziu falsos negativos em massa
 * nesta base (AD-159); conferir a porta custa segundos.
 */

const SKU = '001234';
const TOTAL_DO_CARRINHO = '10,00';
const MINIMO_PIX_REAIS = 5;

async function configurarPix(
  request: APIRequestContext,
  statusPixTransicoes: readonly string[],
): Promise<void> {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
  await request.post(`${URL_ERP_MOCK}/__mock/config`, {
    data: { pixAtivo: true, minimoPix: MINIMO_PIX_REAIS, statusPixTransicoes },
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

async function aplicarPix(page: Page, valor: string): Promise<void> {
  await page.getByTestId('combobox-condicao-pagamento').click();
  await page.getByTestId('opcao-condicao-1').click();

  await page.getByTestId('combobox-forma-pagamento').click();
  await page.getByTestId('opcao-forma-3').click();
  await page.getByTestId('campo-valor-recebido').fill(valor);
  await page.getByTestId('adicionar-pagamento').click();
}

test.describe('Display do cliente — o espelho do QR Code (T041)', () => {
  /**
   * Cenário 2 do quickstart, e **o ponto de atenção do pedido**: o PIX é
   * inserido primeiro, e a tela do cliente só é aberta depois. Sem o handshake
   * (FR-017) ela nasceria em repouso e ficaria assim até a cobrança acabar.
   */
  test('a tela aberta no meio da cobrança sincroniza sozinha pelo handshake', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);

    // `'G'` para sempre: a cobrança fica pendente durante todo o teste.
    await configurarPix(request, ['G']);
    await abrirVendaComItem(page);
    await aplicarPix(page, TOTAL_DO_CARRINHO);

    await expect(page.getByTestId('pix-qrcode')).toBeVisible();

    // A segunda aba nasce **depois** do QR, no mesmo contexto de browser.
    const display = await page.context().newPage();
    await display.goto('/display');

    await expect(display.getByTestId('display-cobranca-pix')).toBeVisible({ timeout: 15_000 });
    await expect(display.getByTestId('display-valor')).toContainText(TOTAL_DO_CARRINHO);

    // FR-008: é a **mesma** cobrança, não uma segunda gerada pela aba do cliente.
    const fonteDoOperador = await page.getByTestId('pix-qrcode').getAttribute('src');
    const fonteDoCliente = await display.getByTestId('display-qrcode').getAttribute('src');
    expect(fonteDoCliente).toBe(fonteDoOperador);

    // FR-005: nada de "copia e cola" na tela virada ao cliente.
    const copiaECola = await page.getByTestId('pix-copia-e-cola').innerText();
    await expect(display.getByText(copiaECola)).toHaveCount(0);

    await display.close();
  });

  /**
   * Cenário 1 do quickstart: a tela já estava aberta quando a cobrança nasceu —
   * o caminho de quem lembra de ligar o monitor no início do turno.
   */
  test('a tela já aberta sai do repouso quando a cobrança é gerada', async ({ page, request }) => {
    test.setTimeout(90_000);

    await configurarPix(request, ['G']);
    await abrirVendaComItem(page);

    const display = await page.context().newPage();
    await display.goto('/display');
    // Repouso: nenhuma cobrança ainda, e nada da venda na tela (FR-003).
    await expect(display.getByTestId('display-boas-vindas')).toBeVisible();

    await page.bringToFront();
    await aplicarPix(page, TOTAL_DO_CARRINHO);

    await expect(display.getByTestId('display-cobranca-pix')).toBeVisible({ timeout: 15_000 });
    await expect(display.getByTestId('display-valor')).toContainText(TOTAL_DO_CARRINHO);

    await display.close();
  });

  /**
   * FR-021 (Cenário 5a): fechar a aba do checkout devolve a tela do cliente ao
   * repouso **imediatamente**, pelo `pagehide` — sem esperar os 15 s do corte
   * por silêncio.
   */
  test('fechar a aba do checkout devolve a tela do cliente ao repouso', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);

    await configurarPix(request, ['G']);
    await abrirVendaComItem(page);
    await aplicarPix(page, TOTAL_DO_CARRINHO);
    await expect(page.getByTestId('pix-qrcode')).toBeVisible();

    const display = await page.context().newPage();
    await display.goto('/display');
    await expect(display.getByTestId('display-cobranca-pix')).toBeVisible({ timeout: 15_000 });

    await page.close();

    await expect(display.getByTestId('display-boas-vindas')).toBeVisible({ timeout: 10_000 });

    await display.close();
  });
});
