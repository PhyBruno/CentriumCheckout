import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';

/**
 * Fluxo dourado do carrinho e do motor de precificação (`quickstart.md`,
 * Camada 3) — cobre T018, T025, T032 e T037.
 */

interface ContadoresMock {
  token: number;
  getSessao: number;
  negocio: number;
  getProduto: number;
  getListaProdutos: number;
}

const SKU_COM_FAIXA = '001234';
const SKU_EDITAVEL = '003000';
/** EAN-13 sintético: prefixo `2`, reduzido `002000`, etiqueta R$ 15,00, DV `6`. */
const EAN_PESAVEL = '2002000015006';

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

/** Passo 1: abre o Checkout pelo redirect do ERP, com a sessão já válida. */
async function abrirTelaDeVenda(page: Page): Promise<void> {
  await page.goto(urlSessionStart());
  await expect(page.getByTestId('tela-de-venda')).toBeVisible();
}

/**
 * Bipa uma entrada e espera a venda refletir o resultado.
 *
 * `linhasEsperadas` existe porque o campo ignora uma nova entrada enquanto a
 * anterior está sendo resolvida — o que evita inserção duplicada de uma mesma
 * leitura. Esperar o item aparecer é o que o operador faz de fato.
 */
async function bipar(page: Page, texto: string, linhasEsperadas?: number): Promise<void> {
  const campo = page.getByTestId('campo-codigo-produto');
  await campo.fill(texto);
  await campo.press('Enter');

  if (linhasEsperadas !== undefined) {
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(linhasEsperadas);
  }
}

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

test.describe('User Story 1 — busca de produto por termo livre (T018)', () => {
  test('termo abaixo do mínimo não dispara GetListaProdutos (AD-024)', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    await page.getByTestId('abrir-busca-produto').click();

    // `QtdMinCharParaConsulta` é 3 no bootstrap sintético.
    await page.getByTestId('campo-busca-produto').fill('PR');
    await expect(page.getByTestId('busca-abaixo-do-minimo')).toBeVisible();

    expect((await contadores(request)).getListaProdutos).toBe(0);
  });

  test('termo completo lista candidatos e a seleção insere via GetProduto (AD-091)', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);
    await page.getByTestId('abrir-busca-produto').click();
    await page.getByTestId('campo-busca-produto').fill('PRODUTO COM FAIXA');

    const candidato = page
      .getByTestId('candidato-produto')
      .filter({ hasText: 'PRODUTO COM FAIXA' });
    await expect(candidato).toBeVisible();
    expect((await contadores(request)).getListaProdutos).toBeGreaterThan(0);

    await candidato.click();

    // A linha é montada a partir de `GetProduto`, nunca do resultado da busca.
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
    expect((await contadores(request)).getProduto).toBe(1);
    await expect(page.getByTestId('total-venda')).toHaveText('R$ 10,00');
  });
});

test.describe('User Story 2 — inserção direta por código conhecido (T025)', () => {
  test('"codigo*3" insere quantidade 3 e o código simples insere quantidade 1', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);

    await bipar(page, `${SKU_COM_FAIXA}*3`, 1);
    await expect(page.getByTestId('total-venda')).toHaveText('R$ 30,00');

    await bipar(page, SKU_COM_FAIXA, 2);
    // 3 + 1 unidades, ainda a R$ 10,00 com `TipoPreco = 1`.
    await expect(page.getByTestId('total-venda')).toHaveText('R$ 40,00');
  });

  test('EAN-13 de balança deriva quantidade e preço da etiqueta (AD-076)', async ({ page }) => {
    await abrirTelaDeVenda(page);

    await bipar(page, EAN_PESAVEL, 1);

    // R$ 15,00 de etiqueta ÷ R$ 10,00/kg = 1,500 kg; o total é recalculado por
    // preço × quantidade, e não copiado da etiqueta (`data-model.md` §1).
    await expect(page.getByTestId('linha-carrinho')).toContainText('1,500');
    await expect(page.getByTestId('preco-unitario')).toHaveText('R$ 10,00');
    await expect(page.getByTestId('total-venda')).toHaveText('R$ 15,00');
  });

  test('produto editável não entra ao confirmar a entrada; só no botão "+" (FR-014)', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);

    const campo = page.getByTestId('campo-codigo-produto');
    await campo.fill(SKU_EDITAVEL);
    await campo.press('Tab');

    // O formulário de revisão aparece e nenhuma linha foi criada.
    await expect(page.getByTestId('edicao-item-editavel')).toBeVisible();
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0);
    // A unidade vem do cadastro e não é editável no PDV.
    await expect(page.getByTestId('edicao-unidade')).toHaveAttribute('readonly', '');

    await page.getByTestId('edicao-quantidade').fill('2');
    await page.getByTestId('confirmar-item-editavel').click();

    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
    await expect(page.getByTestId('total-venda')).toHaveText('R$ 40,00');
  });

  test('reinserir o mesmo SKU não gera nova chamada a GetProduto (CART-03)', async ({
    page,
    request,
  }) => {
    await abrirTelaDeVenda(page);

    await bipar(page, SKU_COM_FAIXA, 1);
    await bipar(page, SKU_COM_FAIXA, 2);

    expect((await contadores(request)).getProduto).toBe(1);
  });

  test('código inexistente não insere linha nenhuma', async ({ page }) => {
    await abrirTelaDeVenda(page);

    await bipar(page, '999999');

    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0);
  });
});

test.describe('User Story 3 — faixa de quantidade (T032, TipoPreco 8)', () => {
  test.beforeEach(async ({ request }) => {
    await configurar(request, { tipoPreco: 8 });
  });

  test('cruzar o limiar aplica o novo preço a todas as linhas do SKU (FR-006)', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);

    await bipar(page, `${SKU_COM_FAIXA}*3`, 1);
    await expect(page.getByTestId('preco-unitario')).toHaveText('R$ 10,00');

    // Agregado 6 ≥ limiar de 5 unidades → ambas as linhas passam a R$ 9,00.
    await bipar(page, `${SKU_COM_FAIXA}*3`, 2);
    await expect(page.getByTestId('preco-unitario')).toHaveText(['R$ 9,00', 'R$ 9,00']);
    await expect(page.getByTestId('total-venda')).toHaveText('R$ 54,00');
  });
});

test.describe('User Story 4 — item cancelado permanece rastreável (T037)', () => {
  test.beforeEach(async ({ request }) => {
    await configurar(request, { tipoPreco: 8 });
  });

  test('a linha cancelada fica visível e riscada, e as demais voltam à faixa inferior', async ({
    page,
  }) => {
    await abrirTelaDeVenda(page);
    await bipar(page, `${SKU_COM_FAIXA}*3`, 1);
    await bipar(page, `${SKU_COM_FAIXA}*3`, 2);
    await expect(page.getByTestId('total-venda')).toHaveText('R$ 54,00');

    // Sem modal de confirmação e sem supervisor (FR-012, AD-065).
    await page.getByTestId('cancelar-item').last().click();

    const linhas = page.getByTestId('linha-carrinho');
    // Continua visível — nunca sai do array (CART-08, FR-009).
    await expect(linhas).toHaveCount(2);
    await expect(linhas.last()).toHaveAttribute('data-cancelada', 'true');
    await expect(linhas.last()).toHaveCSS('text-decoration-line', 'line-through');
    // A remanescente volta à faixa 1 e o subtotal exclui a cancelada.
    await expect(linhas.first().getByTestId('preco-unitario')).toHaveText('R$ 10,00');
    await expect(page.getByTestId('total-venda')).toHaveText('R$ 30,00');
  });

  test('mesmo comportamento no layout mobile (passo 10)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await abrirTelaDeVenda(page);
    await expect(page.getByTestId('lista-itens-mobile')).toBeVisible();

    await bipar(page, `${SKU_COM_FAIXA}*3`, 1);
    await bipar(page, `${SKU_COM_FAIXA}*3`, 2);
    await expect(page.getByTestId('total-venda')).toHaveText('R$ 54,00');

    await page.getByTestId('cancelar-item').last().click();

    const linhas = page.getByTestId('linha-carrinho');
    await expect(linhas).toHaveCount(2);
    await expect(linhas.last()).toHaveAttribute('data-cancelada', 'true');
    await expect(page.getByTestId('total-venda')).toHaveText('R$ 30,00');
  });
});

test.describe('Constitution VI — nada de estado de venda persistido', () => {
  test('o carrinho não sobrevive a um reload', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await bipar(page, SKU_COM_FAIXA, 1);

    await page.reload();
    await expect(page.getByTestId('tela-de-venda')).toBeVisible();

    // Zustand sem `persist` (AD-006): nada foi gravado em lugar nenhum.
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(0);
  });
});
