import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';

/**
 * Venda rápida por cenário de pagamento (feature 013, T023/T024) —
 * `specs/013-venda-rapida-cenario-pagamento/quickstart.md`, cenários C1, C3,
 * C6, C8, C9 e C10.
 *
 * O `erp-mock` publica quatro cenários em `SessaoUsuario.CenarioPagamento`, dos
 * quais **dois** viram atalho: F6 (dinheiro à vista, encerra a operação) e F7
 * (débito à vista, não encerra, com a tecla cadastrada como `"f7 "`). Os outros
 * dois — um com `;` extra no nome e um sem tecla — precisam sumir sem levar os
 * válidos junto.
 *
 * O mock roda com `TEFAtivo: false` e `UtilizaCentriumPAG: false`, então toda
 * forma roteia para `NENHUMA` e o pagamento entra `APROVADO` na hora — o mesmo
 * cenário de `pagamento-geral.spec.ts`, e o motivo de não haver aqui um caso de
 * TEF/PIX: não existe operador capaz de aprová-lo pela tela.
 *
 * O serviço de impressão local é stubado pelo mesmo motivo dos demais E2E: a
 * chamada real sai do navegador para o `CadMaqHost`, na rede do PDV.
 */

const URL_SERVICO_IMPRESSAO = 'http://127.0.0.1:4545/**';

/** Produto de 70,00 do mock — o mesmo que `pagamento-geral.spec.ts` bipa. */
const SKU = '070000';

/** `SC-002`: da tecla ao pagamento visível na venda. */
const LIMITE_ACIONAMENTO_MS = 1000;

interface FormaRetrato {
  readonly FormaCodigo?: number;
  readonly FormaValor?: number;
}

interface RetratoFaturado {
  readonly CondicaoPagamentoCodigo?: number;
  readonly FormasDePagamento?: readonly FormaRetrato[];
}

/**
 * Espera o `FaturarNFCe` chegar ao mock e devolve o retrato enviado.
 *
 * `expect.poll`, e não uma leitura única: entre a tecla e a chamada há o
 * lançamento do pagamento e o despacho da finalização, e um `get` imediato
 * leria o estado anterior do mock.
 */
async function esperarUltimoFaturamento(
  request: APIRequestContext,
): Promise<RetratoFaturado | null> {
  let ultimo: RetratoFaturado | null = null;

  await expect
    .poll(async () => {
      const resposta = await request.get(`${URL_ERP_MOCK}/__mock/ultimo-faturamento`);
      const corpo = (await resposta.json()) as { retrato: RetratoFaturado | null };
      ultimo = corpo.retrato;
      return ultimo !== null;
    })
    .toBe(true);

  return ultimo;
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

/**
 * Tira o foco de qualquer campo antes de acionar a tecla.
 *
 * Não é conveniência de teste: é o comportamento real do PDV. `FR-014` deixa o
 * atalho inerte enquanto o operador digita, então o E2E que pressiona a tecla
 * com o foco no campo de produto estaria exercitando a **recusa**, não o
 * acionamento.
 */
async function soltarOFoco(page: Page): Promise<void> {
  await page.getByTestId('tela-de-venda').click({ position: { x: 5, y: 5 } });
}

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

/* ------------------------------------------------------------------ *
 * C3 — a faixa mostra só o que sobreviveu ao pipeline
 * ------------------------------------------------------------------ */

test.describe('Faixa de atalhos (C3, FR-016)', () => {
  test('mostra apenas os cenários válidos, com a tecla mal formatada normalizada', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);

    const faixa = page.getByTestId('dica-atalhos-venda-rapida');
    await expect(faixa).toBeVisible();

    await expect(page.getByTestId('atalho-venda-rapida-F6')).toHaveText('Dinheiro à vista (F6)');
    // `"f7 "` no cadastro do ERP: só aparece aqui porque E3 normalizou.
    await expect(page.getByTestId('atalho-venda-rapida-F7')).toHaveText('Débito à vista (F7)');
    // O cenário de 8 campos (`Vale;Ops; promo`) e o sem tecla não viraram atalho.
    await expect(page.getByTestId('atalho-venda-rapida-F8')).toHaveCount(0);
    await expect(page.getByTestId('atalho-venda-rapida-F9')).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------ *
 * C1 + C9 + SC-002 — fluxo dourado
 * ------------------------------------------------------------------ */

test.describe('Fluxo dourado da venda rápida (C1, C9, T023)', () => {
  test('F6 lança o saldo integral e encerra a venda num toque só', async ({ page, request }) => {
    await stubarImpressoraLocal(page);
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);

    // C9: o operador nunca tocou no seletor de condição — o atalho leva a venda
    // à etapa de pagamento e lança o cenário na mesma ação (`FR-019`).
    await expect(page.getByTestId('combobox-condicao-pagamento')).not.toContainText('A VISTA');

    await soltarOFoco(page);
    await page.keyboard.press('F6');

    // A prova de que a venda foi emitida é o **retrato que chegou ao ERP**, não
    // o diálogo do documento fiscal: com `TipoImpressao: 'E'` e a impressora
    // stubada respondendo 200, aquele diálogo se fecha sozinho assim que o
    // cupom "sai" (`DialogoDocumentoFiscal`), e esperar por ele seria disputar
    // uma corrida com a própria impressão.
    //
    // Nenhuma confirmação foi dada em nenhum ponto: a única tecla pressionada
    // entre o carrinho e a NFCe foi F6 (`FR-010`).
    const retrato = await esperarUltimoFaturamento(request);
    expect(retrato?.CondicaoPagamentoCodigo).toBe(1);
    expect(retrato?.FormasDePagamento).toHaveLength(1);
    expect(retrato?.FormasDePagamento?.[0]).toMatchObject({ FormaCodigo: 1, FormaValor: 70 });

    // A venda seguinte já começou limpa.
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0);
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);
  });

  test('do toque ao pagamento visível em menos de 1s (SC-002)', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);
    await soltarOFoco(page);

    // F7 (débito) não encerra a operação: é o atalho que deixa o pagamento **na
    // tela** para poder ser medido. Com F6 a venda finaliza e a lista é
    // esvaziada no mesmo gesto, e não haveria o que cronometrar.
    const inicio = Date.now();
    await page.keyboard.press('F7');
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);
    const decorrido = Date.now() - inicio;

    expect(decorrido).toBeLessThan(LIMITE_ACIONAMENTO_MS);
    await expect(page.getByTestId('combobox-condicao-pagamento')).toContainText('A VISTA');
    // Saldo coberto: o rótulo "Faltante" só existe enquanto sobra saldo, então
    // a ausência dele **é** a afirmação de que o atalho lançou o valor inteiro.
    await expect(page.getByTestId('pagamentos-saldo-restante')).toHaveCount(0);
    // Não encerra: a venda continua com o operador, e o carrinho segue lá.
    await expect(page.getByTestId('dialogo-documento-fiscal')).toHaveCount(0);
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
  });

  test('o clique na faixa faz exatamente o mesmo que a tecla (US3)', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);

    await page.getByTestId('atalho-venda-rapida-F7').click();

    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);
    await expect(page.getByTestId('pagamentos-saldo-restante')).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------ *
 * C6 — recusas que não alteram a venda
 * ------------------------------------------------------------------ */

test.describe('Recusas que não alteram a venda (C6, FR-009)', () => {
  test('carrinho vazio: a tecla não lança nada', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await soltarOFoco(page);

    await page.keyboard.press('F6');

    await expect(page.getByText(/não há itens nesta venda/i).first()).toBeVisible();
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);
    await expect(page.getByTestId('dialogo-documento-fiscal')).toHaveCount(0);
    await expect(page.getByTestId('combobox-condicao-pagamento')).not.toContainText('A VISTA');
  });

  test('venda já paga: o segundo acionamento não duplica nem divide o pagamento', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);
    await soltarOFoco(page);

    await page.keyboard.press('F7');
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);

    // F6 é **outro** cenário (dinheiro), com a mesma condição: a forma viva na
    // venda basta para recusar (G5). O atalho não divide pagamento.
    await page.keyboard.press('F6');

    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);
    await expect(page.getByText(/já tem pagamento iniciado/i).first()).toBeVisible();
    await expect(page.getByTestId('dialogo-documento-fiscal')).toHaveCount(0);
  });

  test('condição escolhida à mão bloqueia o atalho, e a escolha do operador fica de pé', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);

    // Condição 2 ("30 DIAS") pelo combobox; os atalhos apontam para a 1.
    await page.getByTestId('combobox-condicao-pagamento').click();
    await page.getByTestId('opcao-condicao-2').click();
    await expect(page.getByTestId('combobox-condicao-pagamento')).toContainText('30 DIAS');

    await soltarOFoco(page);
    await page.keyboard.press('F6');

    await expect(page.getByText(/já tem pagamento iniciado/i).first()).toBeVisible();
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);
    // A recusa não mexe na venda: a condição do operador continua selecionada.
    await expect(page.getByTestId('combobox-condicao-pagamento')).toContainText('30 DIAS');
  });
});

/* ------------------------------------------------------------------ *
 * C8 — não colide com digitação nem com bipagem
 * ------------------------------------------------------------------ */

test.describe('O atalho não atrapalha a digitação (C8, FR-014, SC-005)', () => {
  test('o campo de código do produto é a exceção: o atalho dispara sem sair dele', async ({
    page,
  }) => {
    // Decisão do usuário (2026-09-05). É onde o caixa passa a venda inteira:
    // obrigá-lo a tirar o foco para fechar a venda transformaria um toque em
    // três gestos.
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);

    const campo = page.getByTestId('campo-codigo-produto');
    await campo.click();
    await expect(campo).toBeFocused();
    await page.keyboard.press('F7');

    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);
  });

  test('com o foco no campo de valor recebido, o atalho continua inerte', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await biparProduto(page, SKU, 1);

    // Qualquer outro campo mantém a regra: a tecla pertence a quem digita.
    // Condição **e** forma, porque o campo de valor só habilita com a forma
    // escolhida. A condição 1 é a mesma dos atalhos, então o que recusa aqui é
    // o foco, não o G5.
    await page.getByTestId('combobox-condicao-pagamento').click();
    await page.getByTestId('opcao-condicao-1').click();
    await page.getByTestId('combobox-forma-pagamento').click();
    await page.getByTestId('opcao-forma-1').click();
    await page.getByTestId('campo-valor-recebido').click();
    await expect(page.getByTestId('campo-valor-recebido')).toBeFocused();
    await page.keyboard.press('F6');
    await page.keyboard.press('F7');

    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);
    await expect(page.getByTestId('dialogo-documento-fiscal')).toHaveCount(0);
  });

  test('uma bipagem inteira continua caindo no carrinho, não nos atalhos', async ({ page }) => {
    await abrirTelaDeVenda(page);

    // O leitor digita no campo focado e termina em Enter — o mesmo caminho de
    // `biparProduto`, aqui com o dígito a dígito do teclado.
    const campo = page.getByTestId('campo-codigo-produto');
    await campo.click();
    await page.keyboard.type(SKU, { delay: 5 });
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------ *
 * C10 — mobile não tem venda rápida (T024)
 * ------------------------------------------------------------------ */

test.describe('Mobile não tem venda rápida (C10, FR-020, T024)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('nenhuma dica de atalho é exibida e a tecla não aciona nada', async ({ page }) => {
    await abrirTelaDeVendaCompacta(page);
    await biparProduto(page, SKU, 1);
    await soltarOFoco(page);

    await expect(page.getByTestId('dica-atalhos-venda-rapida')).toHaveCount(0);
    await expect(page.getByTestId('atalho-venda-rapida-F6')).toHaveCount(0);

    await page.keyboard.press('F6');
    await page.keyboard.press('F7');

    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);
    await expect(page.getByTestId('dialogo-documento-fiscal')).toHaveCount(0);
  });
});

/**
 * No layout compacto o cartão "Pagamento e totais" **não é montado** (a feature
 * 007 ainda não tem o wizard), então esperar por ele travaria o teste. É a
 * própria ausência que garante `FR-020`: a faixa vive dentro daquele cartão.
 */
async function abrirTelaDeVendaCompacta(page: Page): Promise<void> {
  await page.goto(urlSessionStart());
  await expect(page.getByTestId('tela-de-venda')).toBeVisible();
  await expect(page.getByTestId('painel-pagamento-totais')).toHaveCount(0);
}
