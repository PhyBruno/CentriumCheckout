import { describe, expect, it } from 'vitest';
import {
  carregarNFCeOutputSchema,
  listaNFCesOutputSchema,
} from '../../../src/shared/schemas/recuperacaoNFCe.schema';
import {
  EMISSAO_RASCUNHO,
  NUMERO_NOTA,
  rascunhoDaLista,
  respostaCarregarNFCe,
  respostaListaNFCes,
} from '../../support/recuperacao';

/**
 * Fronteira Zod de `GetListaNFCes`/`CarregarNFCe` (T002/T004, Constitution IV).
 */

describe('listaNFCesOutputSchema', () => {
  it('converte Total para centavos inteiros na fronteira', () => {
    const lida = listaNFCesOutputSchema.parse(respostaListaNFCes());

    expect(lida.Rascunho[0]?.Total).toBe(1850);
  });

  /**
   * O ERP real serializa `double`/`int64` como string (AD-165). Um `z.number()`
   * puro reprovaria a resposta inteira, e o Checkout mostraria "erro de
   * formato" para um payload correto de produção.
   */
  it('aceita número serializado como string, do jeito que o ERP real devolve', () => {
    const lida = listaNFCesOutputSchema.parse(
      respostaListaNFCes([rascunhoDaLista({ Total: '167.89', NumeroNota: '18452' })]),
    );

    expect(lida.Rascunho[0]?.Total).toBe(16789);
    expect(lida.Rascunho[0]?.NumeroNota).toBe(18452);
  });

  /**
   * `Emissao` atravessa **crua**. Reinterpretá-la aqui (via `Date`) aplicaria o
   * fuso do navegador do PDV a um instante que o servidor já resolveu.
   */
  it('repassa Emissao sem reinterpretar', () => {
    const lida = listaNFCesOutputSchema.parse(respostaListaNFCes());

    expect(lida.Rascunho[0]?.Emissao).toBe(EMISSAO_RASCUNHO);
  });

  /**
   * O ERP real entrega o SDT na raiz quando a procedure tem um único parâmetro
   * de saída; o YAML (e o `erp-mock`) desenham o envelope. As duas formas
   * precisam passar — AD-165.
   */
  it('aceita a resposta com e sem o envelope CheckoutListaRascunhos', () => {
    const comEnvelope = listaNFCesOutputSchema.parse(respostaListaNFCes());
    const semEnvelope = listaNFCesOutputSchema.parse(
      respostaListaNFCes().CheckoutListaRascunhos as Record<string, unknown>,
    );

    expect(semEnvelope).toEqual(comEnvelope);
  });

  it('reprova a resposta que não traz a coleção de rascunhos', () => {
    const invalida = listaNFCesOutputSchema.safeParse({
      CheckoutListaRascunhos: { PaginaAtual: 1, RegistrosPorPagina: 20, TotalRegistros: 0 },
    });

    expect(invalida.success).toBe(false);
  });
});

describe('carregarNFCeOutputSchema', () => {
  it('valida o documento completo, reaproveitando o shape de GetDav (AD-117)', () => {
    const lido = carregarNFCeOutputSchema.parse(respostaCarregarNFCe());

    expect(lido.NumeroNota).toBe(NUMERO_NOTA);
    // Preço e desconto chegam em reais e saem em centavos.
    expect(lido.produtos[0]?.precoUnitario).toBe(1000);
    expect(lido.produtos[0]?.DescontoValor).toBe(150);
    expect(lido.FormasDePagamento[0]?.FormaValor).toBe(1850);
  });

  it('aceita a resposta sem envelope, como o ERP real devolve', () => {
    const semEnvelope = carregarNFCeOutputSchema.parse(
      respostaCarregarNFCe().OutCheckoutFaturarNFCe as Record<string, unknown>,
    );

    expect(semEnvelope.NumeroNota).toBe(NUMERO_NOTA);
  });

  /**
   * Uma recusa de negócio do ERP volta `200` com o SDT zerado e sem as
   * coleções. Aceitá-la retomaria um rascunho vazio, com `clienteCodigo: 0`,
   * como se fosse sucesso — falhar na fronteira é o desfecho correto.
   */
  it('reprova o documento sem produtos ou sem formas de pagamento', () => {
    const semProdutos = carregarNFCeOutputSchema.safeParse(
      respostaCarregarNFCe({ produtos: undefined }),
    );
    const semFormas = carregarNFCeOutputSchema.safeParse(
      respostaCarregarNFCe({ FormasDePagamento: undefined }),
    );

    expect(semProdutos.success).toBe(false);
    expect(semFormas.success).toBe(false);
  });
});
