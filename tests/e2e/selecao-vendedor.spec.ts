import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';
import { quitarVendaEmDinheiro } from './support/pagamento';

/**
 * Fluxo dourado da seleção de vendedor (`quickstart.md`, Cenários 1-6) —
 * cobre T015.
 *
 * O Cenário 7 (retomada de rascunho com vendedor sem nome) fica de fora desta
 * suíte de propósito, como o próprio `tasks.md` prevê: é verificação manual
 * (T017) sobre um call site cuja UI é da feature 011. O comportamento do slice
 * naquele caminho está coberto em `tests/integration/vendedorSlice.spec.ts`.
 *
 * O serviço de impressão local é **stubado** (`page.route`) no cenário que
 * fatura: a chamada real vai do navegador direto ao `CadMaqHost`, na rede do
 * PDV, fora do alcance do CI.
 */

interface ContadoresMock {
  negocio: number;
  getListaVendedores: number;
}

interface RetratoFaturado {
  retrato: {
    vendedorCodigo?: number;
    Log?: string;
  } | null;
}

const SKU = '001234';
const URL_SERVICO_IMPRESSAO = 'http://127.0.0.1:4545/**';

/** Do `GetSessao` sintético do mock — distinto do `UsuarioCodigo` 42 (AD-056). */
const VENDEDOR_DEFAULT = { codigo: 21, nome: 'Mariana Alves' } as const;
const USUARIO_CODIGO = 42;

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

/**
 * O campo de vendedor mora na segunda linha do card de cliente, que nasce
 * colapsado (pedido do usuário, 2026-09-03) — os campos só existem visíveis no
 * DOM depois de expandir.
 */
async function expandirCardCliente(page: Page): Promise<void> {
  const alternar = page.getByTestId('alternar-cliente-expandido');
  if ((await alternar.getAttribute('aria-expanded')) === 'false') {
    await alternar.click();
  }
  await expect(page.getByTestId('nome-vendedor')).toBeVisible();
}

async function biparProduto(page: Page): Promise<void> {
  const campo = page.getByTestId('campo-codigo-produto');
  await campo.fill(SKU);
  await campo.press('Enter');
  await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
}

async function buscarVendedor(page: Page, termo: string): Promise<void> {
  await expandirCardCliente(page);
  await page.getByTestId('abrir-busca-vendedor').click();
  await page.getByTestId('campo-busca-vendedor').fill(termo);
}

async function selecionarVendedor(page: Page, nome: string): Promise<void> {
  await expect(page.getByTestId('candidato-vendedor').first()).toBeVisible();
  await page.getByTestId('candidato-vendedor').filter({ hasText: nome }).click();
  await expect(page.getByTestId('modal-busca-vendedor')).toHaveCount(0);
}

async function stubarImpressoraLocal(page: Page): Promise<void> {
  await page.route(URL_SERVICO_IMPRESSAO, (rota) => rota.fulfill({ status: 200, body: '' }));
}

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

test.describe('User Story 1 — selecionar o vendedor da venda (T015)', () => {
  test('cenário 1: a venda nasce com o vendedor default, sem interação nem GetListaVendedores', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    await expandirCardCliente(page);

    // `VendedorNome` do bootstrap sintético (AD-032), sem nenhum indicador de
    // origem ao lado (I5/AD-053).
    await expect(page.getByTestId('nome-vendedor')).toHaveText(VENDEDOR_DEFAULT.nome);
    expect((await contadores(request)).getListaVendedores).toBe(0);
  });

  test('cenário 2: buscar e selecionar um vendedor diferente, depois trocar por um terceiro', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);
    // Com o carrinho **já populado**: a troca de vendedor é permitida nesse
    // estado (`FR-012`), ao contrário do que aconteceria com o cliente depois de
    // um pagamento aprovado.
    await biparProduto(page);

    await buscarVendedor(page, 'Marcos');
    await selecionarVendedor(page, 'Marcos Pereira');
    await expect(page.getByTestId('nome-vendedor')).toHaveText('Marcos Pereira');

    await buscarVendedor(page, 'Marta');
    await selecionarVendedor(page, 'Marta Souza');
    await expect(page.getByTestId('nome-vendedor')).toHaveText('Marta Souza');

    // O carrinho não é reprecificado pela troca: a linha continua a mesma
    // (AD-059/AD-060 — vendedor não entra em nenhum `TipoPreco`).
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
  });

  test('a busca não expõe filtro nem coluna de status, nem subtítulo de função (AD-103)', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);
    await buscarVendedor(page, 'Mar');

    await expect(page.getByTestId('resultados-busca-vendedor')).toBeVisible();
    const modal = page.getByTestId('modal-busca-vendedor');
    await expect(modal.getByText('Ativo', { exact: true })).toHaveCount(0);
    await expect(modal.getByText('Status', { exact: true })).toHaveCount(0);
    await expect(modal.getByText(/respons[áa]vel/i)).toHaveCount(0);
    // Vendedor não é cadastrado pelo Checkout (`FR-015`): não há CTA de criação,
    // ao contrário do modal de cliente.
    await expect(modal.getByText(/novo vendedor/i)).toHaveCount(0);
  });

  test('cenário 3: a finalização envia o vendedor selecionado, nunca o operador logado', async ({
    page,
    request,
  }) => {
    await stubarImpressoraLocal(page);
    await abrirTelaDeVenda(page);
    await biparProduto(page);

    await buscarVendedor(page, 'Marta');
    await selecionarVendedor(page, 'Marta Souza');

    await quitarVendaEmDinheiro(page);
    await page.getByTestId('botao-finalizar-venda').click();
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0);

    const { retrato } = await ultimoRetrato(request);
    // `FR-007`/`SC-001`: o vendedor da venda, não o vendedor do PDV e não o
    // `UsuarioCodigo` do operador.
    expect(retrato?.vendedorCodigo).toBe(8);
    expect(retrato?.vendedorCodigo).not.toBe(USUARIO_CODIGO);
    expect(retrato?.vendedorCodigo).not.toBe(VENDEDOR_DEFAULT.codigo);
    // A trilha registra a escolha do operador — e só ela: a pré-seleção do
    // default nunca vira evento (I3).
    expect(retrato?.Log).toContain('VENDEDOR_SELECIONADO');
    expect(retrato?.Log).not.toContain('VENDEDOR_TROCADO');
  });

  test('a finalização sem interação envia o vendedor default do PDV', async ({ page, request }) => {
    await stubarImpressoraLocal(page);
    await abrirTelaDeVenda(page);
    await biparProduto(page);
    await quitarVendaEmDinheiro(page);

    await page.getByTestId('botao-finalizar-venda').click();
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0);

    const { retrato } = await ultimoRetrato(request);
    expect(retrato?.vendedorCodigo).toBe(VENDEDOR_DEFAULT.codigo);
    expect(retrato?.Log).not.toContain('VENDEDOR_');
  });

  test('cenário 4: empresa sem vendedor default deixa o campo vazio, exigindo seleção manual', async ({
    page,
    request,
  }) => {
    await configurar(request, { semVendedorDefault: true });
    await abrirTelaDeVenda(page);
    await expandirCardCliente(page);

    // `FR-006`/`VEND-07`: `vendedorAtual` chega `null` a tempo de a feature 004
    // bloquear o "Finalizar" — este teste confirma o estado, não o bloqueio.
    await expect(page.getByTestId('nome-vendedor')).toHaveText('Selecionar vendedor');

    await page.getByTestId('abrir-busca-vendedor').click();
    await page.getByTestId('campo-busca-vendedor').fill('Marcos');
    await selecionarVendedor(page, 'Marcos Pereira');
    await expect(page.getByTestId('nome-vendedor')).toHaveText('Marcos Pereira');
  });

  test('cenário 5: busca sem resultado mantém a seleção e fecha sem bloqueio', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await buscarVendedor(page, 'ZZZZ');

    await expect(page.getByTestId('busca-vendedor-sem-resultados')).toBeVisible();
    await page.getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByTestId('modal-busca-vendedor')).toHaveCount(0);

    // `FR-010`/`FR-011`: nem a lista vazia nem o fechamento sem escolha alteram
    // o vendedor da venda.
    await expect(page.getByTestId('nome-vendedor')).toHaveText(VENDEDOR_DEFAULT.nome);
  });

  test('cenário 6: com pagamento aprovado, a troca é no-op e o operador é avisado', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);
    await biparProduto(page);
    await quitarVendaEmDinheiro(page);

    await buscarVendedor(page, 'Marta');
    await selecionarVendedor(page, 'Marta Souza');

    // `FR-013`/`VEND-09` (AD-043): o mesmo predicado que congela o carrinho
    // congela o vendedor. O campo continua no default.
    await expect(page.getByTestId('nome-vendedor')).toHaveText(VENDEDOR_DEFAULT.nome);
    // `.first()`: o toast escreve a frase duas vezes — o `span` visível e um
    // duplicado para leitores de tela.
    await expect(page.getByText(/o vendedor não pode mais ser trocado/i).first()).toBeVisible();
  });
});
