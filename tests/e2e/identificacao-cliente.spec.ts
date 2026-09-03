import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';

/**
 * Fluxo dourado da identificação e do cadastro de cliente (`quickstart.md`,
 * Camada 3) — cobre T020 (passos 1, 2, 3, 6, 7, 8) e T025 (passos 4 e 5).
 */

interface ContadoresMock {
  negocio: number;
  getProduto: number;
  getCliente: number;
  getListaClientes: number;
  postCliente: number;
}

/** Do cadastro sintético do mock (`erp-mock.ts`). */
const CPF_VAREJO = '12298023980';
const CPF_CONVENIADO = '89554068000';
const CNPJ_EXISTENTE = '52059715000113';
const CPF_INEXISTENTE = '11122233344';
const CNPJ_INEXISTENTE = '11222333000181';

const SKU_COM_FAIXA = '001234';

async function contadores(request: APIRequestContext): Promise<ContadoresMock> {
  const resposta = await request.get(`${URL_ERP_MOCK}/__mock/calls`);
  return (await resposta.json()) as ContadoresMock;
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
 * O card nasce colapsado (pedido do usuário, 2026-09-03) — os campos de
 * identificação só existem no DOM depois de expandir.
 */
async function expandirCardCliente(page: Page): Promise<void> {
  const alternar = page.getByTestId('alternar-cliente-expandido');
  if ((await alternar.getAttribute('aria-expanded')) === 'false') {
    await alternar.click();
  }
  await expect(page.getByTestId('campo-documento-cliente')).toBeVisible();
}

async function identificarPorDocumento(page: Page, documento: string): Promise<void> {
  await expandirCardCliente(page);
  await page.getByTestId('campo-documento-cliente').fill(documento);
  await page.getByTestId('identificar-cliente').click();
}

async function buscarPorTermo(page: Page, termo: string): Promise<void> {
  await expandirCardCliente(page);
  await page.getByTestId('abrir-busca-cliente').click();
  await page.getByTestId('campo-busca-cliente').fill(termo);
}

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

test.describe('User Story 1 — localizar cliente (T020)', () => {
  test('passo 1: a venda nasce com o cliente default, sem interação nem GetCliente', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);

    // `ClienteDefaultNome` do bootstrap sintético (AD-032/AD-108). A pílula é
    // visível já no card colapsado; o campo "Nome / telefone" exige expandir.
    await expect(page.getByTestId('status-cliente')).toHaveText('CONSUMIDOR FINAL');
    await expandirCardCliente(page);
    await expect(page.getByTestId('nome-cliente')).toHaveText('CONSUMIDOR FINAL');
    expect((await contadores(request)).getCliente).toBe(0);
  });

  test('passo 2: busca por documento conhecido associa o cliente à venda', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_VAREJO);

    await expect(page.getByTestId('nome-cliente')).toHaveText('CLIENTE VAREJO');
    expect((await contadores(request)).getCliente).toBe(1);
  });

  test('passo 3: candidato da busca livre é resolvido por GetCliente antes de associar', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    await buscarPorTermo(page, 'CLIENTE');

    await expect(page.getByTestId('candidato-cliente').first()).toBeVisible();
    const antes = await contadores(request);
    await page.getByTestId('candidato-cliente').filter({ hasText: 'CLIENTE CONVENIADO' }).click();

    await expect(page.getByTestId('nome-cliente')).toHaveText('CLIENTE CONVENIADO');
    // A lista não traz `DescontoConvenio`: o snapshot só pode vir de
    // `GetCliente` (`research.md` D1, AD-091).
    expect((await contadores(request)).getCliente).toBe(antes.getCliente + 1);
  });

  test('a busca não expõe filtro nem coluna de status (AD-093)', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await buscarPorTermo(page, 'CLIENTE');

    await expect(page.getByTestId('candidato-cliente').first()).toBeVisible();
    const modal = page.getByTestId('modal-busca-cliente');
    await expect(modal.getByText('Ativo', { exact: true })).toHaveCount(0);
    await expect(modal.getByText('Status', { exact: true })).toHaveCount(0);
  });

  test('passo 8: inserir produto antes de identificar não é bloqueado (FR-003)', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);

    const campo = page.getByTestId('campo-codigo-produto');
    await campo.fill(SKU_COM_FAIXA);
    await campo.press('Enter');

    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
  });

  test('passo 6: trocar o cliente com carrinho populado reprecifica por SKU', async ({
    page,
    request,
  }) => {
    // `TipoPreco = 9`: o preço depende da lista do cliente, então trocá-lo
    // obriga uma nova chamada a `GetProduto` (`research.md` D7).
    await configurar(request, { tipoPreco: 9 });
    await abrirTelaDeVenda(page);

    const campo = page.getByTestId('campo-codigo-produto');
    await campo.fill(SKU_COM_FAIXA);
    await campo.press('Enter');
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    const antes = await contadores(request);
    await identificarPorDocumento(page, CPF_CONVENIADO);
    await expect(page.getByTestId('nome-cliente')).toHaveText('CLIENTE CONVENIADO');

    await expect
      .poll(async () => (await contadores(request)).getProduto)
      .toBeGreaterThan(antes.getProduto);
  });

  test('passo 8 (mobile): os passos 2 e 3 funcionam no layout compacto', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await abrirTelaDeVenda(page);

    await identificarPorDocumento(page, CPF_VAREJO);
    await expect(page.getByTestId('nome-cliente')).toHaveText('CLIENTE VAREJO');

    await buscarPorTermo(page, 'CONVENIADO');
    await page.getByTestId('candidato-cliente').first().click();
    await expect(page.getByTestId('nome-cliente')).toHaveText('CLIENTE CONVENIADO');
  });
});

test.describe('User Story 2 — cadastro simplificado (T025)', () => {
  test('passo 4: documento inexistente abre o cadastro e cria o cliente', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_INEXISTENTE);

    const modal = page.getByTestId('modal-cadastro-cliente');
    await expect(modal).toBeVisible();
    // O documento buscado já vem preenchido — o operador não redigita.
    await expect(page.getByTestId('campo-cadastro-cpf')).toHaveValue(CPF_INEXISTENTE);

    // Sem campos de crédito (`FR-014`, AD-026).
    await expect(modal.getByText('Limite', { exact: false })).toHaveCount(0);

    await page.getByTestId('campo-cadastro-nome').fill('CLIENTE NOVO E2E');
    // `FR-012`: com CEP fora do formato o envio continua bloqueado.
    await page.getByTestId('campo-cadastro-cep').fill('123');
    await expect(page.getByTestId('salvar-cliente')).toBeDisabled();

    await page.getByTestId('campo-cadastro-cep').fill('89000-000');
    await page.getByTestId('campo-cadastro-cidade').fill('SINOP');
    await page.getByTestId('campo-cadastro-uf').fill('MT');
    await page.getByTestId('salvar-cliente').click();

    await expect(modal).toBeHidden();
    await expect(page.getByTestId('nome-cliente')).toHaveText('CLIENTE NOVO E2E');

    const depois = await contadores(request);
    expect(depois.postCliente).toBe(1);
    // `PostCliente` não devolve o cliente criado: o `CodCliente` vem do
    // `GetCliente` seguinte (`contracts/erp-cliente-api.md`).
    expect(depois.getCliente).toBeGreaterThanOrEqual(2);
  });

  test('passo 5: CNPJ sem resultado não oferece cadastro simplificado (FR-010)', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    await buscarPorTermo(page, CNPJ_INEXISTENTE);

    await expect(page.getByTestId('busca-cliente-sem-resultados')).toBeVisible();
    await expect(page.getByTestId('aviso-cnpj')).toBeVisible();
    await expect(page.getByTestId('cadastro-simplificado')).toHaveCount(0);
    expect((await contadores(request)).postCliente).toBe(0);
  });

  test('passo 5: CNPJ com resultado é selecionável normalmente', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await buscarPorTermo(page, CNPJ_EXISTENTE);

    await page.getByTestId('candidato-cliente').first().click();
    await expect(page.getByTestId('nome-cliente')).toHaveText('NILMAQ COMERCIO DE PECAS');
  });

  test('CPF sem resultado na busca livre oferece o cadastro simplificado', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await buscarPorTermo(page, CPF_INEXISTENTE);

    await expect(page.getByTestId('busca-cliente-sem-resultados')).toBeVisible();
    await expect(page.getByTestId('aviso-cnpj')).toHaveCount(0);
    await page.getByTestId('cadastro-simplificado').click();

    await expect(page.getByTestId('modal-cadastro-cliente')).toBeVisible();
    await expect(page.getByTestId('campo-cadastro-cpf')).toHaveValue(CPF_INEXISTENTE);
  });
});

test.describe('Ajustes pedidos pelo usuário em 2026-09-03', () => {
  test('o card nasce colapsado, com as pílulas visíveis, e expande sob demanda', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);

    // Colapsado: o cabeçalho já responde "quem é o cliente", sem custar altura
    // permanente ao carrinho.
    await expect(page.getByTestId('alternar-cliente-expandido')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.getByTestId('campo-documento-cliente')).toHaveCount(0);
    await expect(page.getByTestId('status-cliente')).toHaveText('CONSUMIDOR FINAL');

    await page.getByTestId('alternar-cliente-expandido').click();
    await expect(page.getByTestId('campo-documento-cliente')).toBeVisible();
    await expect(page.getByTestId('alternar-cliente-expandido')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  test('a pílula do vendedor vem de SessaoUsuario, não de GetCliente', async ({ page }) => {
    await abrirTelaDeVenda(page);

    // `ClienteCheckout` não tem campo de vendedor no contrato do ERP; o valor
    // é o `VendedorNome` do PDV, do bootstrap.
    await expect(page.getByTestId('pilula-vendedor')).toHaveText('Mariana Alves');
    await expect(page.getByTestId('pilula-operador')).toHaveText('Operador de Teste');
  });

  test('tirar o foco do campo já busca o cliente, sem clicar em Identificar', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    await expandirCardCliente(page);

    await page.getByTestId('campo-documento-cliente').fill(CPF_VAREJO);
    // TAB tira o foco do campo — é o gesto do caixa, que segue direto para o
    // produto sem passar pelo botão.
    await page.getByTestId('campo-documento-cliente').press('Tab');

    await expect(page.getByTestId('nome-cliente')).toHaveText('CLIENTE VAREJO');
    expect((await contadores(request)).getCliente).toBe(1);
  });

  test('o documento do cliente identificado fica legível no campo, com máscara', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_VAREJO);
    await expect(page.getByTestId('nome-cliente')).toHaveText('CLIENTE VAREJO');

    await expect(page.getByTestId('campo-documento-cliente')).toHaveValue('122.980.239-80');

    // Sair do campo com o mesmo documento já associado não rebusca o cliente.
    const antes = (await contadores(request)).getCliente;
    await page.getByTestId('campo-documento-cliente').press('Tab');
    expect((await contadores(request)).getCliente).toBe(antes);
  });
});

test.describe('Achados da revisão de 2026-09-03', () => {
  test('termo abaixo do mínimo não dispara GetListaClientes (AD-024)', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    await expandirCardCliente(page);
    await page.getByTestId('abrir-busca-cliente').click();

    // `QtdMinCharParaConsulta` é 3 no bootstrap sintético — o piso vem do ERP,
    // nunca hardcodado.
    await page.getByTestId('campo-busca-cliente').fill('CL');
    await expect(page.getByTestId('busca-cliente-abaixo-do-minimo')).toBeVisible();
    expect((await contadores(request)).getListaClientes).toBe(0);

    await page.getByTestId('campo-busca-cliente').fill('CLI');
    await expect(page.getByTestId('candidato-cliente').first()).toBeVisible();
    expect((await contadores(request)).getListaClientes).toBeGreaterThan(0);
  });

  test('candidato sem CPF é resolvido pelo código, sem abrir o cadastro sozinho', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);
    await buscarPorTermo(page, 'SEM DOCUMENTO');

    await page.getByTestId('candidato-cliente').first().click();

    await expect(page.getByTestId('nome-cliente')).toHaveText('CLIENTE SEM DOCUMENTO');
    // Resolver pelo documento vazio daria 404 e abriria o cadastro simplificado
    // sem o operador ter pedido.
    await expect(page.getByTestId('modal-cadastro-cliente')).toHaveCount(0);
  });

  test('reescolher o mesmo cliente não dispara nova consulta ao ERP', async ({ page, request }) => {
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_CONVENIADO);
    await expect(page.getByTestId('nome-cliente')).toHaveText('CLIENTE CONVENIADO');

    const antes = (await contadores(request)).getProduto;
    await page.getByTestId('abrir-busca-cliente').click();
    await page.getByTestId('campo-busca-cliente').fill('CONVENIADO');
    await page.getByTestId('candidato-cliente').first().click();

    await expect(page.getByTestId('nome-cliente')).toHaveText('CLIENTE CONVENIADO');
    expect((await contadores(request)).getProduto).toBe(antes);
  });
});

test.describe('Verificação manual apoiada pelo E2E', () => {
  test('F5 no meio da venda descarta o cliente selecionado (Constitution VI)', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_CONVENIADO);
    await expect(page.getByTestId('nome-cliente')).toHaveText('CLIENTE CONVENIADO');

    await page.reload();
    await expect(page.getByTestId('tela-de-venda')).toBeVisible();
    // O card volta colapsado (estado de UI também não sobrevive ao F5), então a
    // prova é a pílula do cabeçalho.
    await expect(page.getByTestId('status-cliente')).toHaveText('CONSUMIDOR FINAL');
  });
});
