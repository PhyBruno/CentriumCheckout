import { expect, type Page } from '@playwright/test';

/**
 * Quita a venda inteira em dinheiro pela UI de pagamento (feature 008).
 *
 * Existe porque a feature 008 **estendeu** a guarda de "Finalizar venda": ter
 * item com valor deixou de bastar, o botão só libera com `saldoRestante === 0`
 * (`AcoesFinaisVenda.useVendaTemValorAFaturar`). Todo E2E que finaliza uma venda
 * precisa, a partir daí, passar por aqui primeiro — antes da 008 não havia
 * caminho de pagamento nenhum na tela, e finalizar direto era o fluxo real.
 *
 * Usa **dinheiro** (`opcao-forma-1` do catálogo do mock) de propósito: é a única
 * forma que nunca depende de integração externa em nenhuma configuração de
 * flags, então o pagamento entra `APROVADO` na hora sem as features 009/010.
 *
 * O valor é lido da própria tela, e não passado pelo chamador, para o helper
 * continuar correto quando o teste mudar a composição do carrinho. No desktop ele
 * vem do bloco escuro; na etapa 2 do celular esse bloco não existe desde AD-255
 * (só a revisão o mostra), e o total sai do rodapé da lista de itens — o mesmo
 * número, porque nenhum destes testes aplica desconto de capa.
 */
export async function quitarVendaEmDinheiro(page: Page): Promise<void> {
  await page.getByTestId('combobox-condicao-pagamento').click();
  await page.getByTestId('opcao-condicao-1').click();

  const blocoEscuro = page.getByTestId('total-a-pagar');
  const origemDoTotal =
    (await blocoEscuro.count()) > 0 ? blocoEscuro : page.getByTestId('total-venda');
  const totalTexto = (await origemDoTotal.innerText()).trim();

  await page.getByTestId('combobox-forma-pagamento').click();
  await page.getByTestId('opcao-forma-1').click();
  await page.getByTestId('campo-valor-recebido').fill(emReaisDigitaveis(totalTexto));
  await page.getByTestId('adicionar-pagamento').click();

  // O saldo sumir é a prova de que o pagamento entrou aprovado: o bloco
  // "Faltante" só é renderizado enquanto `saldoRestante > 0`.
  await expect(page.getByTestId('pagamentos-saldo-restante')).toHaveCount(0);
}

/**
 * `R$ 1.234,56` → `1234,56`.
 *
 * O separador de milhar cai junto com o `R$` porque a classe negada só preserva
 * dígito e vírgula — o campo recebe exatamente o que o operador digitaria, sem
 * ponto de milhar.
 */
function emReaisDigitaveis(texto: string): string {
  return texto.replace(/[^\d,]/g, '');
}
