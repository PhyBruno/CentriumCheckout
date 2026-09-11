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

  /**
   * Regressão de AD-217, relatada pelo usuário: *"Ao dar zoom o nome da
   * organização vai descendo e fica bugado"*, na tela **com QR Code**.
   *
   * Zoom do navegador é, para o layout, o mesmo que encolher a viewport em
   * pixels CSS — por isso o teste redimensiona em vez de chamar uma API de zoom
   * (o Playwright não tem uma). Três alturas: a de um monitor de PDV, uma
   * equivalente a ~200 % e outra a ~350 %.
   *
   * O que se afirma é **ausência de sobreposição**, não posição exata: a tela é
   * um kiosk que não rola, então qualquer caixa que invada a de cima é conteúdo
   * perdido para quem está pagando. Duas invasões diferentes existiam antes: o
   * miolo subia por cima da marca (`justify-center` transbordando simétrico) e o
   * QR Code vazava o próprio cartão (imagem de tamanho fixo num cartão que
   * encolhe).
   */
  test('a cobrança não se sobrepõe em nenhum nível de zoom (AD-217)', async ({ page, request }) => {
    test.setTimeout(90_000);

    await configurarPix(request, ['G']);
    await abrirVendaComItem(page);
    await aplicarPix(page, TOTAL_DO_CARRINHO);

    const display = await page.context().newPage();
    await display.goto('/display');
    await expect(display.getByTestId('display-cobranca-pix')).toBeVisible({ timeout: 15_000 });

    for (const tamanho of [
      { width: 1920, height: 1000 },
      { width: 1280, height: 590 },
      { width: 800, height: 380 },
      // ~350 %: é **só aqui** que o cartão do QR chega a encolher, e portanto o
      // único tamanho que pega a imagem vazando a moldura. Sem esta linha o
      // teste passa mesmo com o defeito de volta — verificado removendo o
      // `max-h-full` e vendo os outros três continuarem verdes.
      { width: 560, height: 280 },
    ]) {
      await display.setViewportSize(tamanho);

      const caixas = await display.evaluate(() => {
        const medir = (seletor: string): { topo: number; base: number } | null => {
          const elemento = document.querySelector(seletor);
          if (elemento === null) {
            return null;
          }
          const caixa = elemento.getBoundingClientRect();
          return { topo: caixa.top, base: caixa.bottom };
        };
        const imagem = document.querySelector('[data-testid="display-qrcode"]');
        const cartao = imagem?.parentElement?.getBoundingClientRect();

        return {
          marca: medir('[data-testid="display-nome-loja"]'),
          titulo: medir('[data-testid="display-cobranca-pix"] h1'),
          qrCode: medir('[data-testid="display-qrcode"]'),
          cartao: cartao === undefined ? null : { topo: cartao.top, base: cartao.bottom },
          alturaDaTela: window.innerHeight,
        };
      });

      const onde = `${tamanho.width}x${tamanho.height}`;
      const { marca, titulo, qrCode, cartao, alturaDaTela } = caixas;
      if (marca === null || titulo === null || qrCode === null || cartao === null) {
        throw new Error(`tela incompleta em ${onde}: alguma caixa não foi encontrada`);
      }

      // O título do miolo começa depois que a marca termina — era exatamente
      // aqui que "Pague com PIX" aparecia escrito por cima do nome da loja.
      expect(titulo.topo, `título invade a marca em ${onde}`).toBeGreaterThanOrEqual(marca.base);
      // E o QR Code não passa do cartão que o emoldura, em cima nem embaixo. A
      // folga de 1 px absorve o arredondamento de subpixel do layout.
      expect(qrCode.topo, `QR Code vaza o cartão por cima em ${onde}`).toBeGreaterThanOrEqual(
        cartao.topo - 1,
      );
      expect(qrCode.base, `QR Code vaza o cartão por baixo em ${onde}`).toBeLessThanOrEqual(
        cartao.base + 1,
      );
      // Nada começa fora da tela pelo topo: com `center` puro o excedente saía
      // pelos dois lados, e o que saía por cima ficava inalcançável.
      expect(marca.topo, `conteúdo começa acima da tela em ${onde}`).toBeGreaterThanOrEqual(0);
      expect(marca.base, `marca fora da tela em ${onde}`).toBeLessThan(alturaDaTela);
    }

    await display.close();
  });
});
