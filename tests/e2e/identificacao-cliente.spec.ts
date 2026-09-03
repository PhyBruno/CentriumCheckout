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

/**
 * Trecho do motivo único de recusa de pessoa jurídica
 * (`MOTIVO_VENDA_PESSOA_JURIDICA`, `domain/cliente/documento.ts`) — o toast e o
 * aviso do modal repetem a norma, e cada superfície acrescenta a própria
 * instrução, que aqui não interessa.
 */
const TEXTO_RECUSA_PJ = /Ajuste SINIEF 11\/2025/i;

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

/**
 * Prova que os campos estão recolhidos.
 *
 * O colapso é animado por `grid-template-rows: 0fr → 1fr` (`cc-colapsavel`),
 * técnica que exige manter o conteúdo montado — `not.toBeVisible()` não serve,
 * porque o Playwright mede a caixa do próprio elemento e ignora o corte por
 * `overflow: hidden` do pai. O que de fato define o estado é a altura zero do
 * container e o `inert`, que tira os campos do TAB e dos leitores de tela.
 */
async function esperarCamposRecolhidos(page: Page): Promise<void> {
  const campos = page.getByTestId('campos-cliente-venda');
  await expect(campos).toHaveAttribute('inert', '');
  await expect.poll(async () => (await campos.boundingBox())?.height ?? -1).toBe(0);
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

    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE VAREJO');
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

    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE CONVENIADO');
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
    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE CONVENIADO');

    await expect
      .poll(async () => (await contadores(request)).getProduto)
      .toBeGreaterThan(antes.getProduto);
  });

  test('passo 8 (mobile): os passos 2 e 3 funcionam no layout compacto', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await abrirTelaDeVenda(page);

    await identificarPorDocumento(page, CPF_VAREJO);
    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE VAREJO');

    await buscarPorTermo(page, 'CONVENIADO');
    await page.getByTestId('candidato-cliente').first().click();
    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE CONVENIADO');
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
    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE NOVO E2E');

    const depois = await contadores(request);
    expect(depois.postCliente).toBe(1);
    // `PostCliente` não devolve o cliente criado: o `CodCliente` vem do
    // `GetCliente` seguinte (`contracts/erp-cliente-api.md`).
    expect(depois.getCliente).toBeGreaterThanOrEqual(2);
  });

  test('passo 5: CNPJ sem cadastro é recusado na busca, sem consultar o ERP', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    const antes = await contadores(request);
    await buscarPorTermo(page, CNPJ_INEXISTENTE);

    // Ajuste SINIEF 11/2025: nem a busca acontece — o CNPJ é recusado antes de
    // `GetListaClientes`. O aviso vive **só no toast** (correção do usuário,
    // 2026-09-03): o corpo do modal não repete a mensagem.
    await expect(page.getByText(TEXTO_RECUSA_PJ).first()).toBeVisible();
    await expect(page.getByTestId('aviso-cnpj')).toHaveCount(0);
    await expect(page.getByTestId('resultados-busca-cliente')).toHaveCount(0);

    const depois = await contadores(request);
    expect(depois.getListaClientes).toBe(antes.getListaClientes);
    expect(depois.postCliente).toBe(0);
  });

  test('passo 5: CNPJ que existe no ERP também é recusado na busca', async ({ page, request }) => {
    // O cadastro existir não muda nada: a NFCe é que não pode ser emitida para
    // pessoa jurídica, então listar o candidato só produziria um clique morto.
    await abrirTelaDeVenda(page);
    const antes = await contadores(request);
    await buscarPorTermo(page, CNPJ_EXISTENTE);

    await expect(page.getByText(TEXTO_RECUSA_PJ).first()).toBeVisible();
    await expect(page.getByTestId('aviso-cnpj')).toHaveCount(0);
    await expect(page.getByTestId('candidato-cliente')).toHaveCount(0);
    expect((await contadores(request)).getListaClientes).toBe(antes.getListaClientes);
  });

  test('pessoa jurídica não aparece na busca por nome — o ERP já filtra', async ({ page }) => {
    // `PCheckout_ClientesLista` filtra `where CliTip = 'F'` nos dois `For Each`
    // (verificado no código-fonte da KB, 2026-09-03). O mock reproduzia a lista
    // sem esse filtro e exibia a NILMAQ, um cenário que produção nunca produz
    // (achado do usuário, 2026-09-03).
    await abrirTelaDeVenda(page);
    await buscarPorTermo(page, 'NILMAQ');

    await expect(page.getByTestId('busca-cliente-sem-resultados')).toBeVisible();
    await expect(page.getByTestId('candidato-cliente')).toHaveCount(0);
  });

  test('código de pessoa jurídica é recusado e zera a identificação', async ({ page }) => {
    // Caminho que sobra depois do filtro do ERP: o código não se parece com um
    // CNPJ, então só a guarda de `useCliente` — sobre o documento que
    // `GetCliente` devolveu — consegue recusá-lo.
    await abrirTelaDeVenda(page);
    await expandirCardCliente(page);
    await page.getByTestId('campo-documento-cliente').fill('2209');
    await page.getByTestId('identificar-cliente').click();

    await expect(page.getByText(TEXTO_RECUSA_PJ).first()).toBeVisible();

    // A venda fica **sem cliente**: nome, contato e as pílulas zeram, em vez de
    // seguirem mostrando o cliente anterior (pedido do usuário, 2026-09-03).
    await expect(page.getByTestId('status-cliente')).toHaveText('Não identificado');
    await expect(page.getByTestId('pilula-vendedor')).toHaveCount(0);

    await expandirCardCliente(page);
    await expect(page.getByTestId('campo-documento-cliente')).toHaveValue('');
    await expect(page.getByTestId('nome-cliente')).toHaveText('Buscar cliente cadastrado');
    await expect(page.getByTestId('contato-cliente')).toHaveText('—');
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
    await esperarCamposRecolhidos(page);
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

    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE VAREJO');
    expect((await contadores(request)).getCliente).toBe(1);
  });

  test('o documento do cliente identificado fica legível no campo, com máscara', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_VAREJO);
    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE VAREJO');

    // O card recolheu ao identificar; reabri-lo mostra o documento mascarado.
    await expandirCardCliente(page);
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

    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE SEM DOCUMENTO');
    // Resolver pelo documento vazio daria 404 e abriria o cadastro simplificado
    // sem o operador ter pedido.
    await expect(page.getByTestId('modal-cadastro-cliente')).toHaveCount(0);
  });

  test('reescolher o mesmo cliente não dispara nova consulta ao ERP', async ({ page, request }) => {
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_CONVENIADO);
    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE CONVENIADO');

    const antes = (await contadores(request)).getProduto;
    await expandirCardCliente(page);
    await page.getByTestId('abrir-busca-cliente').click();
    await page.getByTestId('campo-busca-cliente').fill('CONVENIADO');
    await page.getByTestId('candidato-cliente').first().click();

    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE CONVENIADO');
    expect((await contadores(request)).getProduto).toBe(antes);
  });
});

test.describe('Recolher e devolver o foco ao identificar (pedido do usuário, 2026-09-03)', () => {
  /** O campo de código só recebe foco de fato quando está habilitado. */
  async function esperarFocoNoCodigo(page: Page): Promise<void> {
    await expect(page.getByTestId('campo-codigo-produto')).toBeFocused();
  }

  async function esperarCardRecolhido(page: Page): Promise<void> {
    await expect(page.getByTestId('alternar-cliente-expandido')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await esperarCamposRecolhidos(page);
  }

  test('documento existente recolhe o card e devolve o foco ao código do produto', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_VAREJO);

    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE VAREJO');
    await esperarCardRecolhido(page);
    await esperarFocoNoCodigo(page);
  });

  test('o mesmo vale ao sair do campo por TAB, sem clicar em Identificar', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await expandirCardCliente(page);
    await page.getByTestId('campo-documento-cliente').fill(CPF_VAREJO);
    await page.getByTestId('campo-documento-cliente').press('Tab');

    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE VAREJO');
    await esperarCardRecolhido(page);
    await esperarFocoNoCodigo(page);
  });

  test('escolher um candidato no modal recolhe o card e devolve o foco', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await buscarPorTermo(page, 'CONVENIADO');
    await page.getByTestId('candidato-cliente').first().click();

    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE CONVENIADO');
    await esperarCardRecolhido(page);
    await esperarFocoNoCodigo(page);
  });

  test('o cliente cadastrado entra na venda, o card recolhe e o foco volta', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_INEXISTENTE);

    await expect(page.getByTestId('modal-cadastro-cliente')).toBeVisible();
    await page.getByTestId('campo-cadastro-nome').fill('CLIENTE NOVO FOCO');
    await page.getByTestId('campo-cadastro-cep').fill('89000-000');
    await page.getByTestId('salvar-cliente').click();

    // Autoinserido na venda pelo próprio slice, sem passo extra do operador.
    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE NOVO FOCO');
    await expect(page.getByTestId('modal-cadastro-cliente')).toHaveCount(0);
    await esperarCardRecolhido(page);
    await esperarFocoNoCodigo(page);
  });

  test('identificar e bipar em seguida, sem tocar no mouse', async ({ page }) => {
    // O ganho real do pedido: o caixa identifica o cliente e digita o próximo
    // item direto, porque o foco já está no campo certo.
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_VAREJO);
    await esperarFocoNoCodigo(page);

    await page.keyboard.type(SKU_COM_FAIXA);
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
  });

  test('uma segunda identificação seguida também devolve o foco', async ({ page }) => {
    // Guarda contra o sinal de foco virar um booleano: o segundo pedido
    // precisa disparar o efeito de novo.
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_VAREJO);
    await esperarFocoNoCodigo(page);

    await page.getByTestId('campo-codigo-produto').blur();
    await identificarPorDocumento(page, CPF_CONVENIADO);

    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE CONVENIADO');
    await esperarFocoNoCodigo(page);
  });
});

test.describe('Código ou documento no mesmo campo (correções de 2026-09-03)', () => {
  test('o campo mostra o código quando o cliente não tem documento (default)', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await expandirCardCliente(page);

    // `GetSessao` entrega o cliente default sem CPF/CNPJ (AD-108); deixar o
    // campo vazio esconderia do operador quem está na venda.
    await expect(page.getByTestId('campo-documento-cliente')).toHaveValue('1');
  });

  test('até 6 dígitos consulta por CodCliente, não por documento', async ({ page, request }) => {
    await abrirTelaDeVenda(page);
    await expandirCardCliente(page);
    await page.getByTestId('campo-documento-cliente').fill('1255');
    await page.getByTestId('identificar-cliente').click();

    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE VAREJO');
    expect((await contadores(request)).getCliente).toBe(1);
  });

  test('pontos e traços são descartados antes de consultar o ERP', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await expandirCardCliente(page);
    // O operador digita a máscara inteira; o ERP recebe `12298023980`.
    await page.getByTestId('campo-documento-cliente').fill('122.980.239-80');
    await page.getByTestId('identificar-cliente').click();

    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE VAREJO');
  });

  test('CNPJ no campo é recusado sem consultar o ERP', async ({ page, request }) => {
    // O cadastro `NILMAQ` existe no mock; mesmo assim nenhuma consulta sai —
    // venda para pessoa jurídica exige NFe emitida pelo ERP.
    await abrirTelaDeVenda(page);
    await expandirCardCliente(page);
    await page.getByTestId('campo-documento-cliente').fill('52.059.715/0001-13');
    await page.getByTestId('identificar-cliente').click();

    await expect(page.getByText(TEXTO_RECUSA_PJ).first()).toBeVisible();
    await expect(page.getByTestId('status-cliente')).toHaveText('CONSUMIDOR FINAL');
    expect((await contadores(request)).getCliente).toBe(0);
  });

  test('12 dígitos recebem a mesma recusa do CNPJ inteiro, sem consultar o ERP', async ({
    page,
    request,
  }) => {
    // Corte único acima de 11 dígitos: completar o número até 14 só levaria à
    // mesma recusa, então a mensagem já é a que diz o que fazer.
    await abrirTelaDeVenda(page);
    await expandirCardCliente(page);
    await page.getByTestId('campo-documento-cliente').fill('123456789012');
    await page.getByTestId('identificar-cliente').click();

    await expect(page.getByText(TEXTO_RECUSA_PJ).first()).toBeVisible();
    await expect(page.getByTestId('campos-cliente-venda')).not.toHaveAttribute('inert', '');
    expect((await contadores(request)).getCliente).toBe(0);
  });

  test('código inexistente avisa, sem abrir o cadastro simplificado', async ({ page }) => {
    // Errar o número do código não é descobrir um cliente novo.
    await abrirTelaDeVenda(page);
    await expandirCardCliente(page);
    await page.getByTestId('campo-documento-cliente').fill('999999');
    await page.getByTestId('identificar-cliente').click();

    await expect(page.getByTestId('modal-cadastro-cliente')).toHaveCount(0);
  });

  test('o CEP ganha máscara ao sair do campo, no cadastro', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_INEXISTENTE);
    await expect(page.getByTestId('modal-cadastro-cliente')).toBeVisible();

    const cep = page.getByTestId('campo-cadastro-cep');
    await cep.fill('89000000');
    await cep.press('Tab');
    await expect(cep).toHaveValue('89000-000');
  });

  test('e-mail e celular vazios não impedem o cadastro', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_INEXISTENTE);

    await page.getByTestId('campo-cadastro-nome').fill('CLIENTE SEM CONTATO');
    await page.getByTestId('campo-cadastro-cep').fill('89000000');
    await expect(page.getByTestId('campo-cadastro-email')).toHaveValue('');
    await expect(page.getByTestId('campo-cadastro-celular')).toHaveValue('');
    await expect(page.getByTestId('salvar-cliente')).toBeEnabled();

    await page.getByTestId('salvar-cliente').click();
    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE SEM CONTATO');
  });
});

test.describe('Verificação manual apoiada pelo E2E', () => {
  test('F5 no meio da venda descarta o cliente selecionado (Constitution VI)', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await identificarPorDocumento(page, CPF_CONVENIADO);
    await expect(page.getByTestId('status-cliente')).toHaveText('CLIENTE CONVENIADO');

    await page.reload();
    await expect(page.getByTestId('tela-de-venda')).toBeVisible();
    // O card volta colapsado (estado de UI também não sobrevive ao F5), então a
    // prova é a pílula do cabeçalho.
    await expect(page.getByTestId('status-cliente')).toHaveText('CONSUMIDOR FINAL');
  });
});
