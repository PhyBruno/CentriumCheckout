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
 *   → janela mostra o estado aprovado e fecha sozinha
 *   → PIX listado como aplicado, saldo zerado
 * ```
 *
 * **`statusPixTransicoes` é sempre explícito aqui** (AD-161): desde 2026-09-04 o
 * mock, sem roteiro, decide o status pelo **relógio** — pago 20s depois de
 * gerado, que é o que o teste manual na stack local precisa. Um E2E que
 * dependesse disso mediria o relógio, então cada cenário abaixo continua
 * desenhando a sequência que quer.
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
    // `image/png`, não `image/jpeg`: o tipo é detectado a partir dos bytes reais
    // do `Trnbase64image` (AD-161, item 5) — antes disto a UI declarava JPEG para
    // qualquer conteúdo, inclusive para os PNG que o ERP de fato gera.
    const src = await qrCode.getAttribute('src');
    expect(src).toMatch(/^data:image\/png;base64,.+/);
    // A imagem precisa de fato **carregar**: um base64 que não é imagem passaria
    // pela asserção de `src` acima e ainda assim mostraria um ícone quebrado.
    await expect
      .poll(async () => qrCode.evaluate((elemento: HTMLImageElement) => elemento.naturalWidth))
      .toBeGreaterThan(0);

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
    // A janela **não** desmonta na aprovação: ela mostra o estado aprovado e só
    // então fecha sozinha, 10s depois (AD-161, item 7).
    await expect(page.getByTestId('pix-badge-status')).toContainText('Pagamento confirmado', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('fechar-modal-pix')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await expect(page.getByTestId('modal-pix')).toHaveCount(0, { timeout: 30_000 });

    const aplicado = page.getByTestId('pagamento-aplicado');
    await expect(aplicado).toHaveCount(1);
    await expect(aplicado).toHaveAttribute('data-status', 'APROVADO');
    await expect(aplicado).toContainText('PIX');

    // "Faltante" só é renderizado enquanto o saldo é positivo: sumir é a prova
    // de que o pagamento entrou aprovado e cobriu a venda.
    await expect(page.getByTestId('pagamentos-saldo-restante')).toHaveCount(0);
  });

  test('desistir da janela com o PIX pendente libera a venda para outra forma', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);

    // `'G'` para sempre: a cobrança nunca é paga e o operador desiste.
    await configurarPix(request, ['G']);
    await abrirVendaComItem(page);
    await aplicarPix(page, TOTAL_DO_CARRINHO);

    await expect(page.getByTestId('pix-qrcode')).toBeVisible();

    // ESC é inerte com a cobrança pendente (AD-161, item 7): era o gesto que
    // mais facilmente deixava uma cobrança órfã no banco sem o operador notar.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-pix')).toBeVisible();

    // A saída existe, é deliberada e passa por confirmação. O rótulo diz
    // "Desistir", e não "Cancelar", porque o Checkout não cancela cobrança PIX.
    await page.getByTestId('desistir-operacao-pix').click();
    await expect(page.getByTestId('confirmar-desistencia-pix')).toBeVisible();
    await page.getByTestId('confirmar-desistencia-pix-confirmar').click();

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

  /**
   * AD-161 (itens 1.1, 2 e 3 do usuário, 2026-09-04) — o recorte que separou PIX
   * de TEF, exercitado de ponta a ponta com um PIX **já aprovado**, que era
   * exatamente o estado em que o operador ficava sem saída:
   *
   * - "Cancelar venda" não era bloqueado nem perguntado nada (item 1);
   * - a forma PIX não podia ser removida da lista (item 2);
   * - não havia confirmação nenhuma (item 3).
   */
  test('com PIX aprovado: cancelar venda pergunta, e a forma pode ser removida com confirmação', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);

    await configurarPix(request, ['P']);
    await abrirVendaComItem(page);
    await aplicarPix(page, TOTAL_DO_CARRINHO);

    // Aprovado no primeiro tick; a janela se despede sozinha depois de 10s.
    await expect(page.getByTestId('modal-pix')).toHaveCount(0, { timeout: 60_000 });
    const aplicado = page.getByTestId('pagamento-aplicado');
    await expect(aplicado).toHaveAttribute('data-status', 'APROVADO');

    // --- item 1.1: cancelar a venda pergunta antes ---------------------------
    await page.getByTestId('botao-cancelar-venda').click();
    await expect(page.getByTestId('confirmar-suspensao-pix')).toBeVisible();

    // Recusar a confirmação não suspende nada: a venda continua exatamente como
    // estava, com o PIX aplicado.
    await page.getByTestId('confirmar-suspensao-pix-cancelar').click();
    await expect(page.getByTestId('confirmar-suspensao-pix')).toHaveCount(0);
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);

    // --- itens 2 e 3: remover o PIX, com confirmação -------------------------
    await page.getByTestId('remover-pagamento').click();
    await expect(page.getByTestId('confirmar-remocao-pix')).toBeVisible();
    await page.getByTestId('confirmar-remocao-pix-confirmar').click();

    // A forma sai e o bloco inteiro some (sem pagamento não há o que listar) —
    // a venda volta a poder ser reorganizada com outra forma.
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);
    await expect(page.getByTestId('pagamentos-aplicados')).toHaveCount(0);
  });
});
