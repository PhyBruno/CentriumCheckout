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
      respostaListaNFCes([rascunhoDaLista({ Total: '167.89', NumeroRascunho: '18452' })]),
    );

    expect(lida.Rascunho[0]?.Total).toBe(16789);
    expect(lida.Rascunho[0]?.NumeroRascunho).toBe(18452);
  });

  /**
   * Linha do contrato de 2026-09-14 (AD-235, medida no preview): série e
   * código/nome separados no lugar das strings `"<código> - <NOME>"`.
   */
  it('lê série, códigos e nomes da linha, tolerando nome vazio', () => {
    const lida = listaNFCesOutputSchema.parse(
      respostaListaNFCes([
        rascunhoDaLista({
          Serie: 'R01',
          ClienteCodigo: '17',
          VendedorCodigo: '0',
          VendedorNome: '',
          OperadorCodigo: '0',
          OperadorNome: '',
        }),
      ]),
    );

    expect(lida.Rascunho[0]).toMatchObject({
      Serie: 'R01',
      ClienteCodigo: 17,
      ClienteNome: 'CLIENTE TESTE 01',
      VendedorCodigo: 0,
      VendedorNome: '',
      OperadorCodigo: 0,
      OperadorNome: '',
    });
  });

  it('reprova a linha no formato antigo, sem NumeroRascunho nem Serie', () => {
    const invalida = listaNFCesOutputSchema.safeParse(
      respostaListaNFCes([
        {
          NumeroNota: 1,
          Cliente: '1 - X',
          Vendedor: '8 - Y',
          Operador: '0 -',
          Emissao: '',
          Total: 1,
        },
      ]),
    );

    expect(invalida.success).toBe(false);
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

    expect(lido.NumeroRascunho).toBe(NUMERO_NOTA);
    // Preço e desconto chegam em reais e saem em centavos.
    expect(lido.produtos[0]?.precoUnitario).toBe(1000);
    expect(lido.produtos[0]?.DescontoValor).toBe(150);
    expect(lido.FormasDePagamento[0]?.FormaValor).toBe(1850);
  });

  it('aceita a resposta sem envelope, como o ERP real devolve', () => {
    const semEnvelope = carregarNFCeOutputSchema.parse(
      respostaCarregarNFCe().OutCheckoutFaturarNFCe as Record<string, unknown>,
    );

    expect(semEnvelope.NumeroRascunho).toBe(NUMERO_NOTA);
  });

  /**
   * Uma recusa de negócio do ERP volta `200` com o SDT zerado e sem as
   * coleções. Aceitá-la retomaria um rascunho vazio, com `clienteCodigo: 0`,
   * como se fosse sucesso — falhar na fronteira é o desfecho correto.
   *
   * `produtos` é o que discrimina: desde 2026-09-11 `FormasDePagamento` é
   * opcional (o ERP omite a chave quando nada foi pago — ver o caso abaixo),
   * então a ausência dela não distingue mais recusa de documento legítimo.
   */
  it('reprova o documento sem produtos', () => {
    const semProdutos = carregarNFCeOutputSchema.safeParse(
      respostaCarregarNFCe({ produtos: undefined }),
    );

    expect(semProdutos.success).toBe(false);
  });

  /**
   * Documento sem nenhum pagamento lançado: o ERP **omite** a chave em vez de
   * mandar `[]` (medido ao vivo em 2026-09-11 sobre `GetDav`, que devolve este
   * mesmo SDT — AD-057). É o estado normal de um DAV, e exigir a coleção
   * reprovava na fronteira justamente o caminho feliz da importação.
   */
  it('aceita o documento sem formas de pagamento, com a lista vazia por default', () => {
    const lido = carregarNFCeOutputSchema.parse(
      respostaCarregarNFCe({ FormasDePagamento: undefined }),
    );

    expect(lido.FormasDePagamento).toEqual([]);
    expect(lido.produtos.length).toBeGreaterThan(0);
  });
});
