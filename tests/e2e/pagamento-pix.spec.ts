import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';

/**
 * Fluxo dourado da feature 009 (`specs/009-pagamento-pix/quickstart.md`) — T026.
 *
 * ```text
 * carrinho com 1 item (10,00)
 *   → condição "A VISTA" → forma PIX → adicionar 10,00
 *   → QR Code renderizado a partir de Trnbase64image
 *   → "copia e cola" decodificado e copiável
 *   → StatusPIX devolve 'G' e depois 'P'
 *   → janela fecha sozinha, PIX listado como aplicado, saldo zerado
 * ```
 *
 * Mock de **rede**, não de função: os dois endpoints existem de verdade no ERP
 * mockado (`support/erp-mock.ts`), atrás do proxy `/api/erp/*` do BFF, e o
 * `TrnGUID` que sobe no corpo de `GerarPIX` é o mesmo que volta no status. É o
 * que distingue este teste dos de integração — aqui nada é injetado no
 * componente, inclusive o intervalo de sondagem, que é o de produção (10s,
 * AD-026). Daí o `setTimeout` generoso: a aprovação chega no segundo tick.
 *
 * O ERP mockado nasce com `UtilizaCentriumPAG: false` (é o cenário da 008); este
 * arquivo o liga por `/__mock/config` antes de abrir a tela.
 */

const SKU = '001234';
const TOTAL_DO_CARRINHO = '10,00';
/** `MinimoPix` em reais, como o `double` do ERP — R$ 5,00, abaixo do total. */
const MINIMO_PIX_REAIS = 5;

interface SdtPixCapturado {
  sdt: {
    TrnGUID?: string;
    TrnValor?: number;
    TrnFormaPagamento?: string;
    FPgCod?: number;
    TrnPagadorNome?: string;
    TrnPagadorCgc?: string;
    TrnPagadorEmail?: string;
    TrnPagadorFone?: string;
  } | null;
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

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

async function ultimoPix(request: APIRequestContext): Promise<SdtPixCapturado> {
  const resposta = await request.get(`${URL_ERP_MOCK}/__mock/ultimo-pix`);
  return (await resposta.json()) as SdtPixCapturado;
}

test.describe('Fluxo dourado do PIX (T026)', () => {
  test('gera a cobrança, exibe QR Code e copia-e-cola, e detecta a aprovação sozinho', async ({
    page,
    request,
  }) => {
    // Dois ticks de 10s: o intervalo real de produção não é encurtado aqui.
    test.setTimeout(90_000);

    await configurarPix(request, ['G', 'P']);
    await abrirVendaComItem(page);
    await aplicarPix(page, TOTAL_DO_CARRINHO);

    // --- geração e exibição (`FR-008`) ---------------------------------------
    await expect(page.getByTestId('modal-pix')).toBeVisible();

    const qrCode = page.getByTestId('pix-qrcode');
    await expect(qrCode).toBeVisible();
    const src = await qrCode.getAttribute('src');
    expect(src).toMatch(/^data:image\/jpeg;base64,.+/);

    // O "copia e cola" chega em base64 e é exibido **decodificado** — se o
    // `atob` do mapper fosse esquecido, o texto na tela seria o base64 cru.
    const copiaECola = page.getByTestId('pix-copia-e-cola');
    await expect(copiaECola).toContainText('BR.GOV.BCB.PIX');

    await expect(page.getByTestId('pix-valor-a-cobrar')).toContainText(TOTAL_DO_CARRINHO);
    await expect(page.getByTestId('pix-badge-status')).toContainText('Aguardando confirmação');

    // --- botão copiar (Clipboard API) ----------------------------------------
    await page.getByTestId('copiar-codigo-pix').click();
    const areaDeTransferencia = await page.evaluate(() => navigator.clipboard.readText());
    expect(areaDeTransferencia).toBe(await copiaECola.innerText());

    // --- corpo enviado ao ERP (`FR-010`, `research.md` D5/D7) ----------------
    const { sdt } = await ultimoPix(request);
    expect(sdt?.TrnValor).toBe(10);
    expect(sdt?.TrnFormaPagamento).toBe('Pix');
    expect(sdt?.FPgCod).toBe(3);
    // Cliente default da sessão sintética: nome preenchido, documento vazio —
    // `GetSessao` não devolve o CPF/CNPJ dele (AD-100).
    expect(sdt?.TrnPagadorNome).toBe('CONSUMIDOR FINAL');
    expect(sdt?.TrnPagadorCgc).toBe('');
    expect(sdt?.TrnPagadorEmail).toBe('');
    expect(sdt?.TrnPagadorFone).toBe('');

    // --- aprovação detectada pela sondagem (`FR-001`/`FR-002`) ---------------
    await expect(page.getByTestId('modal-pix')).toHaveCount(0, { timeout: 60_000 });

    const aplicado = page.getByTestId('pagamento-aplicado');
    await expect(aplicado).toHaveCount(1);
    await expect(aplicado).toHaveAttribute('data-status', 'APROVADO');
    await expect(aplicado).toContainText('PIX');

    // "Faltante" só é renderizado enquanto o saldo é positivo: sumir é a prova
    // de que o pagamento entrou aprovado e cobriu a venda.
    await expect(page.getByTestId('pagamentos-saldo-restante')).toHaveCount(0);
  });

  test('fechar a janela com o PIX pendente libera a venda para outra forma', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);

    // `'G'` para sempre: a cobrança nunca é paga e o operador desiste.
    await configurarPix(request, ['G']);
    await abrirVendaComItem(page);
    await aplicarPix(page, TOTAL_DO_CARRINHO);

    await expect(page.getByTestId('pix-qrcode')).toBeVisible();
    await page.getByTestId('cancelar-operacao-pix').click();

    // `FR-004`–`FR-007`: o pagamento pendente sai da lista — não fica órfão — e
    // o saldo volta cheio, disponível para outra forma.
    await expect(page.getByTestId('modal-pix')).toHaveCount(0);
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);

    await page.getByTestId('combobox-forma-pagamento').click();
    await page.getByTestId('opcao-forma-1').click();
    await page.getByTestId('campo-valor-recebido').fill(TOTAL_DO_CARRINHO);
    await page.getByTestId('adicionar-pagamento').click();

    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);
    await expect(page.getByTestId('pagamentos-saldo-restante')).toHaveCount(0);
  });
});
