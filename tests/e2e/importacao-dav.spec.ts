import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';

/**
 * Fluxo dourado da importação de DAV (`quickstart.md`, Cenários 1–5) — cobre
 * T010 e T023.
 *
 * Os dois DAVs sintéticos do mock:
 *
 * - `004821` — emitido **ontem**, `CLIENTE CONVENIADO` (2538), vendedor 12, uma
 *   linha do SKU `001234` a **R$ 7,77**. O catálogo cobra R$ 10,00 pelo mesmo
 *   SKU: é essa divergência que prova o congelamento de preço (`FR-006`).
 * - `004790` — emitido há 4 dias, `CLIENTE VAREJO` (1255), vendedor 8.
 *
 * As emissões são relativas porque a janela abre com o período padrão dos
 * últimos 7 dias (correção do usuário, 2026-09-03): datas fixas sairiam do
 * filtro sozinhas com a passagem do tempo.
 */

interface ContadoresMock {
  getProduto: number;
  listaDavs: number;
  getDav: number;
  getCliente: number;
  faturarNFCe: number;
}

interface RetratoFaturado {
  retrato: Record<string, unknown> | null;
}

const DAV_CONVENIADO = '004821';
const DAV_VAREJO = '004790';
const SKU_DO_DAV = '001234';
const SKU_EDITAVEL = '003000';
const NUMERO_NOTA_DO_DAV = 90210;
const URL_SERVICO_IMPRESSAO = 'http://127.0.0.1:4545/**';

/** `DD/MM/AAAA` de hoje deslocado em dias — o formato que os campos exibem. */
function dataBr(dias: number): string {
  const hoje = new Date();
  const data = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias);
  const doisDigitos = (valor: number): string => String(valor).padStart(2, '0');
  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${String(data.getFullYear())}`;
}

async function contadores(request: APIRequestContext): Promise<ContadoresMock> {
  const resposta = await request.get(`${URL_ERP_MOCK}/__mock/calls`);
  return (await resposta.json()) as ContadoresMock;
}

async function ultimoRetrato(request: APIRequestContext): Promise<RetratoFaturado> {
  const resposta = await request.get(`${URL_ERP_MOCK}/__mock/ultimo-faturamento`);
  return (await resposta.json()) as RetratoFaturado;
}

async function configurar(
  request: APIRequestContext,
  config: Record<string, unknown>,
): Promise<void> {
  await request.post(`${URL_ERP_MOCK}/__mock/config`, { data: config });
}

async function abrirTelaDeVenda(page: Page): Promise<void> {
  await page.goto(urlSessionStart());
  await expect(page.getByTestId('tela-de-venda')).toBeVisible();
}

async function abrirJanelaDeImportacao(page: Page): Promise<void> {
  await page.getByTestId('botao-menu-importacao').click();
  await expect(page.getByTestId('modal-importacao-dav')).toBeVisible();
  await expect(page.getByTestId('linha-dav')).toHaveCount(2);
}

async function importar(page: Page, numeroDav: string): Promise<void> {
  await page.locator(`[data-numero-dav="${numeroDav}"]`).click();
  await page.getByTestId('confirmar-importacao-dav').click();
}

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

test.describe('User Story 1 — listar, buscar e filtrar (T010, Cenário 1)', () => {
  test('a janela lista os documentos disponíveis, paginada e sem falha de rede', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);

    await expect(page.getByTestId('contagem-dav')).toContainText('2');
    await expect(page.getByTestId('paginacao-dav')).toBeVisible();
    await expect(page.getByTestId('dav-pagina-anterior')).toBeDisabled();
    expect((await contadores(request)).listaDavs).toBeGreaterThan(0);
  });

  test('a busca livre filtra para o documento correspondente', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);

    await page.getByTestId('campo-busca-dav').fill('CONVENIADO');

    await expect(page.getByTestId('linha-dav')).toHaveCount(1);
    await expect(page.locator(`[data-numero-dav="${DAV_CONVENIADO}"]`)).toBeVisible();
  });

  test('a janela abre com o período padrão de 7 dias já aplicado', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);

    // Correção do usuário (2026-09-03): início em -7 dias, fim hoje, e nenhum
    // horário exibido — o contrato filtra por dia (`format: date`).
    await expect(page.getByTestId('dav-data-inicial')).toHaveValue(dataBr(-7));
    await expect(page.getByTestId('dav-data-final')).toHaveValue(dataBr(0));
    await expect(page.getByTestId('linha-dav')).toHaveCount(2);
  });

  test('o período de emissão exclui e volta a incluir o documento', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);

    // Janela antiga, que não contém nenhuma das duas emissões.
    await page.getByTestId('dav-data-inicial').fill(dataBr(-60));
    await page.getByTestId('dav-data-final').fill(dataBr(-50));
    await expect(page.getByTestId('dav-sem-resultados')).toBeVisible();

    // Últimos dois dias: só o DAV de ontem entra (o outro é de 4 dias atrás).
    await page.getByTestId('dav-data-inicial').fill(dataBr(-2));
    await page.getByTestId('dav-data-final').fill(dataBr(0));
    await expect(page.getByTestId('linha-dav')).toHaveCount(1);
    await expect(page.locator(`[data-numero-dav="${DAV_CONVENIADO}"]`)).toBeVisible();
  });

  test('o calendário abre a qualquer clique no campo e escolhe a data', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);

    // Clique no meio do campo — no `<input type="date">` nativo isso não abria
    // calendário nenhum, só o ícone do navegador abria (correção do usuário).
    await page.getByTestId('dav-data-inicial').click();
    await expect(page.getByTestId('calendario')).toBeVisible();

    // Escolher um dia fecha o calendário e aplica o filtro.
    await page.locator('[data-dia]').first().click();
    await expect(page.getByTestId('calendario')).toHaveCount(0);
    await expect(page.getByTestId('dav-data-inicial')).not.toHaveValue('');
  });

  test('o calendário sai para fora da janela de importação, sem ser cortado', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);

    // Correção do usuário (2026-09-03): o popover era filho da janela, que é
    // `overflow-hidden`, e o pedaço que passava da borda simplesmente sumia.
    await page.getByTestId('dav-data-final').click();
    const calendario = page.getByTestId('calendario');
    await expect(calendario).toBeVisible();

    // Portal: o calendário pendura direto no `<body>`, fora da árvore do modal.
    await expect(page.getByTestId('modal-importacao-dav').getByTestId('calendario')).toHaveCount(0);
    expect(await calendario.evaluate((elemento) => elemento.parentElement === document.body)).toBe(
      true,
    );

    // E cabe inteiro na viewport — nenhuma linha de dias fica fora da tela.
    const caixa = await calendario.boundingBox();
    const janela = page.viewportSize();
    if (caixa === null || janela === null) {
      throw new Error('calendário sem caixa medível ou viewport sem tamanho');
    }
    expect(caixa.x).toBeGreaterThanOrEqual(0);
    expect(caixa.y).toBeGreaterThanOrEqual(0);
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(janela.width);
    expect(caixa.y + caixa.height).toBeLessThanOrEqual(janela.height);
  });

  test('cada data de emissão é uma pílula própria, com o seu calendário', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);

    // Pedido do usuário (2026-09-03): dois filtros separados, não um só.
    await expect(page.getByLabel('Data inicial de emissão')).toBeVisible();
    await expect(page.getByLabel('Data final de emissão')).toBeVisible();

    // Abrir o calendário de um não abre o do outro: há exatamente um popover.
    const inicialAntes = await page.getByTestId('dav-data-inicial').inputValue();
    await page.getByTestId('dav-data-final').click();
    await expect(page.getByTestId('calendario')).toHaveCount(1);

    // E cada campo aplica só a sua ponta do período: escolher o dia 1º no
    // calendário do fim não encosta na data inicial.
    await page.locator('[data-dia]').first().click();
    await expect(page.getByTestId('dav-data-final')).toHaveValue(/^01\//);
    await expect(page.getByTestId('dav-data-inicial')).toHaveValue(inicialAntes);
  });

  test('ESC fecha a janela de importação', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('modal-importacao-dav')).toHaveCount(0);
  });

  test('não oferece reimpressão de documento já emitido (FR-009, AD-035)', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);

    await expect(page.getByRole('button', { name: /reimprimir/i })).toHaveCount(0);
  });
});

test.describe('User Story 2 — importar o documento completo (T023, Cenário 2)', () => {
  test('o carrinho reflete o documento, com o preço congelado e não o de catálogo', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);
    await importar(page, DAV_CONVENIADO);

    await expect(page.getByTestId('modal-importacao-dav')).toBeHidden();
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    const linha = page.getByTestId('linha-carrinho').first();
    await expect(linha).toHaveAttribute('data-codigo-produto', SKU_DO_DAV);
    // R$ 7,77 do documento — o catálogo cobra R$ 10,00 pelo mesmo SKU (SC-002).
    await expect(linha.getByTestId('preco-unitario')).toHaveText('R$ 7,77');
    await expect(page.getByTestId('total-venda')).toHaveText('R$ 15,54');
  });

  test('a descrição do produto é resolvida em segundo plano (Cenário 4, AD-096)', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);
    await importar(page, DAV_CONVENIADO);

    // O documento não traz descrição: a linha nasce com o código e só depois
    // recebe o nome, por `GetProduto` best-effort — sem alterar o preço.
    const linha = page.getByTestId('linha-carrinho').first();
    await expect(linha).toContainText('PRODUTO COM FAIXA 500G');
    await expect(linha.getByTestId('preco-unitario')).toHaveText('R$ 7,77');
  });

  test('cliente e vendedor do documento entram na venda, mesmo com default pré-selecionado', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    // A tela abre com o cliente default já pré-selecionado (AD-032).
    await expect(page.getByTestId('cliente-da-venda')).toBeVisible();

    await abrirJanelaDeImportacao(page);
    await importar(page, DAV_VAREJO);

    await expect(page.getByTestId('modal-importacao-dav')).toBeHidden();
    // A resolução do cliente do documento é por `CodCliente` (AD-115).
    expect((await contadores(request)).getCliente).toBeGreaterThan(0);
    await expect(page.getByTestId('cliente-da-venda')).toContainText('CLIENTE VAREJO');
  });
});

test.describe('Cenário 3 — a venda importada segue o fluxo normal (FR-008)', () => {
  test('item novo é precificado normalmente enquanto o importado fica congelado', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);
    await importar(page, DAV_CONVENIADO);
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    // Insere manualmente o **mesmo** SKU do documento: ele entra pelo preço de
    // catálogo, e a linha importada permanece a R$ 7,77.
    const campo = page.getByTestId('campo-codigo-produto');
    await campo.fill(SKU_DO_DAV);
    await campo.press('Enter');
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(2);

    const precos = page.getByTestId('preco-unitario');
    await expect(precos.nth(0)).toHaveText('R$ 7,77');
    await expect(precos.nth(1)).toHaveText('R$ 10,00');
  });

  test('Enter sobre o documento selecionado importa, sem passar pelo rodapé', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);

    // Correção do usuário (2026-09-03): selecionar e teclar Enter é o caminho
    // de teclado equivalente ao botão "Importar DAV".
    await page.locator(`[data-numero-dav="${DAV_CONVENIADO}"]`).click();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('modal-importacao-dav')).toBeHidden();
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
  });

  test('FaturarNFCe leva o NumeroNota do documento e nenhum campo de DAV (D8, AD-107)', async ({
    page,
    request,
  }) => {
    await page.route(URL_SERVICO_IMPRESSAO, (rota) => rota.fulfill({ status: 200, body: '' }));

    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);
    await importar(page, DAV_CONVENIADO);
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    await page.getByTestId('botao-finalizar-venda').click();

    await expect.poll(async () => (await contadores(request)).faturarNFCe).toBeGreaterThan(0);

    const { retrato } = await ultimoRetrato(request);
    expect(retrato?.['NumeroNota']).toBe(NUMERO_NOTA_DO_DAV);
    // O elo com o DAV é só esse número: nenhum campo de vínculo é enviado.
    expect(retrato).not.toHaveProperty('DavNum');

    // O número do DAV aparece **exclusivamente** dentro do `Log` — é a trilha
    // de auditoria local (`DAV_IMPORTADO`, AD-114), não um campo de vínculo
    // fiscal (AD-107). Por isso a varredura exclui o `Log`, em vez de proibir a
    // string no payload inteiro.
    const { Log, ...semLog } = retrato ?? {};
    expect(String(Log)).toContain(DAV_CONVENIADO);
    expect(JSON.stringify(semLog)).not.toContain(DAV_CONVENIADO);
    // O cliente do documento chega ao ERP (`FR-007`). O **vendedor** não é
    // afirmado aqui de propósito: `trocarVendedor` ainda é um stub, porque a
    // feature 012 não existe — só quando ela implementar o slice é que o
    // vendedor do DAV chegará ao retrato (ver Notes de `tasks.md`).
    expect(retrato?.['clienteCodigo']).toBe(2538);
    expect((await contadores(request)).faturarNFCe).toBe(1);
  });
});

test.describe('Cenário 5 — documento já faturado por outro operador (D7, AD-052)', () => {
  test('exibe erro, mantém a janela aberta e não popula o carrinho', async ({ page, request }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);

    await configurar(request, { davJaFaturado: true });
    await importar(page, DAV_CONVENIADO);

    // A janela **não** fecha e o carrinho segue vazio — nada de documento
    // parcialmente importado.
    await expect(page.getByTestId('modal-importacao-dav')).toBeVisible();
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0);
  });

  test('depois do erro, importar de novo com o ERP recuperado funciona', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);

    await configurar(request, { davJaFaturado: true });
    await importar(page, DAV_CONVENIADO);
    await expect(page.getByTestId('modal-importacao-dav')).toBeVisible();

    await configurar(request, { davJaFaturado: false });
    await page.getByTestId('confirmar-importacao-dav').click();

    await expect(page.getByTestId('modal-importacao-dav')).toBeHidden();
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
  });
});

test.describe('Um documento nunca entra numa venda em digitação (regra do usuário, 2026-09-03)', () => {
  test('venda com item lançado: o atalho fica desabilitado e não abre a janela', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);

    const campo = page.getByTestId('campo-codigo-produto');
    await campo.fill(SKU_DO_DAV);
    await campo.press('Enter');
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    // O atalho fica **desabilitado** assim que a venda começa (correção do
    // usuário, 2026-09-03): o operador vê que não pode importar antes de
    // tentar, e o motivo fica no `title` do botão.
    const atalho = page.getByTestId('botao-menu-importacao');
    await expect(atalho).toBeDisabled();
    await expect(atalho).toHaveAttribute('title', /já tem itens lançados/i);

    // E clicar assim mesmo **explica** o motivo, em vez de não fazer nada: o
    // bloqueio é `aria-disabled`, não o `disabled` nativo, justamente para o
    // clique continuar chegando (correção do usuário, 2026-09-03).
    //
    // `force` porque a checagem de "actionability" do Playwright recusa
    // qualquer elemento com `aria-disabled`, mesmo o que o navegador clica sem
    // problema — é limitação do teste, não do botão.
    await atalho.click({ force: true });
    await expect(page.getByText(/já tem itens lançados/i).first()).toBeVisible();

    await expect(page.getByTestId('modal-importacao-dav')).toHaveCount(0);
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
  });

  test('item cancelado ainda bloqueia o atalho (pedido do usuário, 2026-09-03)', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);

    const campo = page.getByTestId('campo-codigo-produto');
    await campo.fill(SKU_DO_DAV);
    await campo.press('Enter');
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    // Cancelar a única linha esvazia o que há a faturar, mas a venda continua
    // digitada: a linha permanece no array (`CART-08`) e vai no `Log` e no
    // retrato de `FaturarNFCe`.
    await page.getByTestId('cancelar-item').last().click();
    await expect(page.getByTestId('linha-carrinho')).toHaveAttribute('data-cancelada', 'true');

    const atalho = page.getByTestId('botao-menu-importacao');
    await expect(atalho).toBeDisabled();
    await expect(atalho).toHaveAttribute('title', /mesmo que cancelados/i);

    // Clicar mesmo bloqueado explica o motivo — e a mensagem cita o item
    // cancelado, senão não bateria com o carrinho que o operador está vendo.
    // (`force`: o Playwright recusa clique em `aria-disabled`; o navegador não.)
    await atalho.click({ force: true });
    await expect(page.getByText(/mesmo que cancelados/i).first()).toBeVisible();
    await expect(page.getByTestId('modal-importacao-dav')).toHaveCount(0);

    // A saída continua sendo cancelar a venda — e esse botão está liberado,
    // justamente porque há linha cancelada (AD-140).
    await expect(page.getByTestId('botao-cancelar-venda')).toBeEnabled();
  });

  test('venda com cliente identificado: o atalho fica desabilitado', async ({ page }) => {
    await abrirTelaDeVenda(page);

    // Identificação explícita pelo campo da venda — diferente do cliente
    // default, que é pré-selecionado sozinho e não impede importar.
    await page.getByTestId('alternar-cliente-expandido').click();
    await page.getByTestId('campo-documento-cliente').fill('12298023980');
    await page.getByTestId('identificar-cliente').click();
    await expect(page.getByTestId('cliente-da-venda')).toContainText('CLIENTE VAREJO');

    const atalho = page.getByTestId('botao-menu-importacao');
    await expect(atalho).toBeDisabled();
    await expect(atalho).toHaveAttribute('title', /já tem um cliente identificado/i);
    await expect(page.getByTestId('modal-importacao-dav')).toHaveCount(0);
  });

  test('recusa de pessoa jurídica libera a importação de novo — a venda ficou sem cliente', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);

    // 1) Identificação explícita: a partir daqui a importação é recusada.
    await page.getByTestId('alternar-cliente-expandido').click();
    await page.getByTestId('campo-documento-cliente').fill('12298023980');
    await page.getByTestId('identificar-cliente').click();
    await expect(page.getByTestId('cliente-da-venda')).toContainText('CLIENTE VAREJO');

    // 2) Código de pessoa jurídica (AD-133): o Checkout recusa e **zera** o
    // cliente da venda, de propósito, sem mexer em `houveEscolhaExplicita`.
    // O card recolhe sozinho ao identificar (005), então precisa reabrir.
    await page.getByTestId('alternar-cliente-expandido').click();
    await page.getByTestId('campo-documento-cliente').fill('2209');
    await page.getByTestId('identificar-cliente').click();
    await expect(page.getByTestId('status-cliente')).toHaveText('Não identificado');

    // 3) A venda não tem cliente nenhum, então importar é legítimo. Antes da
    // correção o atalho recusava com "já tem um cliente identificado" apontando
    // para um campo de cliente vazio (AD-139).
    await page.getByTestId('botao-menu-importacao').click();
    await expect(page.getByTestId('modal-importacao-dav')).toBeVisible();
  });

  test('segundo documento é recusado — o NumeroNota do primeiro não é sobrescrito', async ({
    page,
    request,
  }) => {
    await page.route(URL_SERVICO_IMPRESSAO, (rota) => rota.fulfill({ status: 200, body: '' }));

    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);
    await importar(page, DAV_CONVENIADO);
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    // Tentar importar o segundo DAV: o atalho já está desabilitado.
    const atalho = page.getByTestId('botao-menu-importacao');
    await expect(atalho).toBeDisabled();
    await expect(atalho).toHaveAttribute('title', /já foi iniciada a partir de um documento/i);
    await expect(page.getByTestId('modal-importacao-dav')).toHaveCount(0);
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    // E o faturamento continua levando o número do primeiro documento.
    await page.getByTestId('botao-finalizar-venda').click();
    await expect.poll(async () => (await contadores(request)).faturarNFCe).toBeGreaterThan(0);

    const { retrato } = await ultimoRetrato(request);
    expect(retrato?.['NumeroNota']).toBe(NUMERO_NOTA_DO_DAV);
  });
});

test.describe('Cobertura de escopo', () => {
  test('a janela de importação não existe no layout compacto (AD-046)', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 900 });
    await abrirTelaDeVenda(page);

    // `BarraAtalhosVenda` (que hospeda o atalho) só é montada no desktop; o
    // layout compacto usa `AcoesVendaCompactas`.
    await expect(page.getByTestId('botao-menu-importacao')).toHaveCount(0);
  });

  test('o produto editável importado não abre revisão sozinho', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeImportacao(page);
    await importar(page, DAV_VAREJO);

    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
    await expect(page.getByTestId('linha-carrinho').first()).toHaveAttribute(
      'data-codigo-produto',
      SKU_EDITAVEL,
    );
  });
});
