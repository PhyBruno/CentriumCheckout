import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';

/**
 * Fluxo dourado da recuperação de NFCe (`quickstart.md`) — cobre T025.
 *
 * Os dois rascunhos sintéticos do mock reaproveitam os documentos de DAV
 * (AD-057, mesmo corpo):
 *
 * - `90210` — `CLIENTE CONVENIADO`, vendedor 12, uma linha do SKU `001234` a
 *   **R$ 7,77**. O catálogo cobra R$ 10,00 pelo mesmo SKU: é essa divergência
 *   que prova o congelamento de preço na retomada (`NFCE-03`, J2).
 * - `90211` — `CLIENTE VAREJO`, vendedor 8.
 */

interface RetratoFaturado {
  retrato: Record<string, unknown> | null;
}

const NOTA_CONVENIADO = 90210;
const SKU_DO_RASCUNHO = '001234';
const URL_SERVICO_IMPRESSAO = 'http://127.0.0.1:4545/**';

async function ultimoRetrato(request: APIRequestContext): Promise<RetratoFaturado> {
  const resposta = await request.get(`${URL_ERP_MOCK}/__mock/ultimo-faturamento`);
  return (await resposta.json()) as RetratoFaturado;
}

async function abrirTelaDeVenda(page: Page): Promise<void> {
  await page.goto(urlSessionStart());
  await expect(page.getByTestId('tela-de-venda')).toBeVisible();
}

async function abrirJanelaDeRecuperacao(page: Page): Promise<void> {
  await page.getByTestId('botao-menu-importacao').click();
  await expect(page.getByTestId('modal-menu-importacao')).toBeVisible();
  await page.getByTestId('opcao-importar-nfce').click();
  await expect(page.getByTestId('modal-recuperacao-nfce')).toBeVisible();
}

async function retomar(page: Page, numeroNota: number): Promise<void> {
  await page.locator(`[data-numero-nota="${String(numeroNota)}"]`).click();
  await page.getByTestId('confirmar-recuperacao-nfce').click();
}

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

test.describe('User Story 1 — listar e buscar rascunhos', () => {
  test('a janela lista as NFCes suspensas, paginada', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);

    await expect(page.getByTestId('linha-nfce')).toHaveCount(2);
    await expect(page.getByTestId('contagem-nfce')).toContainText('2');
    await expect(page.getByTestId('nfce-pagina-anterior')).toBeDisabled();
    await expect(page.getByTestId('nfce-pagina-proxima')).toBeDisabled();
  });

  test('busca por nome de cliente filtra a lista', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);

    await page.getByTestId('campo-busca-nfce').fill('CONVENIADO');
    await expect(page.getByTestId('linha-nfce')).toHaveCount(1);
    await expect(page.getByTestId('resultados-nfce')).toContainText('CLIENTE CONVENIADO');
  });

  /**
   * Busca por número da nota **não** retorna nada — limitação real do
   * `DataProvider` do ERP, que filtra só nome de cliente e de vendedor
   * (`research.md` D1). É comportamento esperado, não defeito: o teste existe
   * para que uma "correção" futura não o transforme em bug silencioso.
   */
  test('busca pelo número da nota não retorna resultado', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);

    await page.getByTestId('campo-busca-nfce').fill(String(NOTA_CONVENIADO));
    await expect(page.getByTestId('nfce-sem-resultados')).toBeVisible();
  });
});

test.describe('User Story 2 — retomar o rascunho para o carrinho', () => {
  test('o carrinho é hidratado com o preço congelado do rascunho', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);
    await retomar(page, NOTA_CONVENIADO);

    await expect(page.getByTestId('modal-recuperacao-nfce')).toBeHidden();
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    // R$ 7,77 é o preço do rascunho; o catálogo cobra R$ 10,00 pelo mesmo SKU.
    // Ver o de catálogo aqui significaria que `repricarSku` rodou na
    // hidratação, exatamente o que J2 proíbe.
    const linha = page.getByTestId('linha-carrinho').first();
    await expect(linha).toContainText(SKU_DO_RASCUNHO);
    await expect(linha).toContainText('7,77');
  });

  test('o cliente e o vendedor do rascunho passam a ser os da venda', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);
    await retomar(page, NOTA_CONVENIADO);

    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
    await expect(page.getByTestId('nome-cliente')).toContainText('CLIENTE CONVENIADO');
  });

  /**
   * `NFCE-02`/J3: a venda retomada mantém a identidade do rascunho. Sem isso o
   * faturamento sairia com `NumeroNota: 0` e o ERP emitiria uma nota nova,
   * deixando o rascunho original pendurado — sem erro e sem aviso.
   */
  test('a finalização reenvia o NumeroNota original do rascunho', async ({ page, request }) => {
    await page.route(URL_SERVICO_IMPRESSAO, (rota) => rota.fulfill({ status: 200, body: '' }));

    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);
    await retomar(page, NOTA_CONVENIADO);
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    // **Sem quitar**: o rascunho volta pago (AD-169), e é exatamente por isso
    // que a venda retomada já satisfaz o `saldoRestante === 0` que a 008 exige
    // para liberar "Finalizar venda". Quitar de novo aqui somaria um pagamento
    // sobre uma venda já coberta — que é o que a própria 008 recusa.
    await page.getByTestId('botao-finalizar-venda').click();

    await expect
      .poll(async () => (await ultimoRetrato(request)).retrato?.['NumeroNota'])
      .toBe(NOTA_CONVENIADO);
  });
});

test.describe('pré-condição — venda já iniciada', () => {
  /**
   * Um rascunho não entra numa venda já iniciada (pedido do usuário,
   * 2026-09-04): depois de retomar o primeiro, o atalho fecha para um segundo.
   *
   * O motivo que o operador lê é **o pagamento**, não a identidade da venda:
   * `recusaDeImportacao` avalia `podeMutar` antes de `numeroNota`, e o rascunho
   * volta pago (AD-169), então o bloqueio mais restritivo é o que responde. A
   * recusa por "já importou documento" continua coberta pela importação de DAV
   * (`importacao-dav.spec.ts` § "segundo documento é recusado"), cujo documento
   * é pendente de cobrança e não congela a venda.
   */
  test('o atalho fecha depois que um documento já foi retomado', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);
    await retomar(page, NOTA_CONVENIADO);
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    const atalho = page.getByTestId('botao-menu-importacao');
    await expect(atalho).toBeDisabled();
    await expect(atalho).toHaveAttribute('title', /já há pagamento aprovado nesta venda/i);
  });
});

/**
 * A venda retomada já paga: o congelamento e a saída (AD-169, decisão (a)+(c)).
 *
 * É o caminho que só passou a ser exercitável quando o `erp-mock` deixou de
 * devolver o rascunho como se fosse um DAV — antes disso a venda retomada nunca
 * congelava no E2E, e o comportamento central da feature ficava sem cobertura
 * de ponta a ponta.
 */
test.describe('venda retomada já paga — congelamento e saída', () => {
  test('a grid recusa alteração e explica que a venda veio paga', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);
    await retomar(page, NOTA_CONVENIADO);
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);

    // O pagamento do rascunho chega aplicado e aprovado.
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);

    await page.getByTestId('campo-codigo-produto').fill(SKU_DO_RASCUNHO);
    await page.getByTestId('campo-codigo-produto').press('Enter');

    // Nada entra, e o aviso nomeia o documento — não um gesto do operador.
    await expect(page.getByTestId('linha-carrinho')).toHaveCount(1);
    // `.first()`: o toast escreve a frase duas vezes — o `span` visível e um
    // `role="alert"` com `aria-live` para o leitor de tela.
    await expect(
      page.getByText(/retomada com o pagamento já registrado no documento/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('"Limpar" pede confirmação e, confirmado, devolve o carrinho', async ({ page }) => {
    await abrirTelaDeVenda(page);
    await abrirJanelaDeRecuperacao(page);
    await retomar(page, NOTA_CONVENIADO);
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);

    await page.getByTestId('limpar-pagamento').click();

    const dialogo = page.getByTestId('confirmar-limpeza-documento');
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('Este valor já foi recebido');
    await expect(dialogo).toContainText('a NFCe sai sem o valor que o cliente já pagou');

    // Voltar mantém tudo como estava — o desfecho seguro é o alcançável sem mirar.
    await page.getByTestId('confirmar-limpeza-documento-cancelar').click();
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(1);

    await page.getByTestId('limpar-pagamento').click();
    await page.getByTestId('confirmar-limpeza-documento-confirmar').click();
    await expect(page.getByTestId('pagamento-aplicado')).toHaveCount(0);

    // `FR-008` volta a valer: o item novo entra e é precificado pelo catálogo
    // (R$ 10,00), sem tocar na linha congelada do rascunho (R$ 7,77).
    await page.getByTestId('campo-codigo-produto').fill(SKU_DO_RASCUNHO);
    await page.getByTestId('campo-codigo-produto').press('Enter');

    await expect(page.getByTestId('linha-carrinho')).toHaveCount(2);
    const precos = page.getByTestId('preco-unitario');
    await expect(precos.nth(0)).toHaveText('R$ 7,77');
    await expect(precos.nth(1)).toHaveText('R$ 10,00');
  });
});
