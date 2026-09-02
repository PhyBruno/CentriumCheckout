import { describe, expect, it } from 'vitest';
import {
  checkoutListaProdutosSchema,
  sdtCheckoutGetProdutoSchema,
} from '../../../src/shared/schemas/produto.schema';
import { respostaGetProduto } from '../../support/precificacao';

/** T012 — validação de fronteira e conversão double → Centavos/Milesimos. */
describe('sdtCheckoutGetProdutoSchema', () => {
  it('aceita a resposta completa de GetProduto', () => {
    expect(sdtCheckoutGetProdutoSchema.safeParse(respostaGetProduto()).success).toBe(true);
  });

  it('converte preços double em Centavos inteiros na fronteira (Constitution V)', () => {
    const produto = sdtCheckoutGetProdutoSchema.parse(respostaGetProduto());

    expect(produto.PrecoVenda).toBe(1000);
    expect(produto.PrecoVenda1).toBe(1000);
    expect(produto.PrecoVenda2).toBe(900);
  });

  it('arredonda preço com dízima do JSON para o centavo mais próximo', () => {
    const produto = sdtCheckoutGetProdutoSchema.parse(
      respostaGetProduto({ PrecoVenda: 19.999999999 }),
    );

    expect(produto.PrecoVenda).toBe(2000);
    expect(Number.isInteger(produto.PrecoVenda)).toBe(true);
  });

  it('converte QtdMinimaPreco (unidades) em Milesimos', () => {
    const produto = sdtCheckoutGetProdutoSchema.parse(respostaGetProduto({ QtdMinimaPreco2: 5 }));

    expect(produto.QtdMinimaPreco2).toBe(5000);
    expect(produto.QtdMinimaPreco3).toBe(0);
  });

  it.each(['S', 'B', '', 'E'])('aceita ProdutoPesavelEditavel = "%s" (AD-070)', (valor) => {
    expect(
      sdtCheckoutGetProdutoSchema.safeParse(respostaGetProduto({ ProdutoPesavelEditavel: valor }))
        .success,
    ).toBe(true);
  });

  it('recusa ProdutoPesavelEditavel fora dos quatro valores — erro de fronteira', () => {
    expect(
      sdtCheckoutGetProdutoSchema.safeParse(respostaGetProduto({ ProdutoPesavelEditavel: 'X' }))
        .success,
    ).toBe(false);
  });

  it.each(['CodigoProduto', 'Descricao', 'UDM', 'PrecoVenda', 'ProdutoPesavelEditavel'])(
    'recusa resposta sem %s',
    (campo) => {
      const payload = respostaGetProduto();
      delete payload[campo];

      expect(sdtCheckoutGetProdutoSchema.safeParse(payload).success).toBe(false);
    },
  );

  it('recusa PrecoVenda em formato não numérico', () => {
    expect(sdtCheckoutGetProdutoSchema.safeParse(respostaGetProduto({ PrecoVenda: '10' })).success).toBe(
      false,
    );
  });

  it('preserva campos extras do ERP sem transformá-los (Constitution III)', () => {
    const produto = sdtCheckoutGetProdutoSchema.parse(
      respostaGetProduto({ CampoNovoDoErp: 'valor' }),
    );

    expect(produto['CampoNovoDoErp']).toBe('valor');
  });
});

describe('checkoutListaProdutosSchema', () => {
  function listaValida(): Record<string, unknown> {
    return {
      PaginaAtual: 1,
      RegistrosPorPagina: 20,
      TotalRegistros: 137,
      TotalPaginas: 7,
      Produtos: [
        {
          CodigoProduto: '001234',
          Descricao: 'PRODUTO EXEMPLO 500G',
          Referencia: 'REF-EX',
          CodigoBarras: '7890000000001',
          UDM: 'UN',
        },
      ],
    };
  }

  it('aceita a resposta paginada da busca', () => {
    expect(checkoutListaProdutosSchema.safeParse(listaValida()).success).toBe(true);
  });

  it('aceita lista vazia de candidatos', () => {
    expect(
      checkoutListaProdutosSchema.safeParse({ ...listaValida(), Produtos: [] }).success,
    ).toBe(true);
  });

  it('recusa candidato sem CodigoProduto — é o único campo que a busca precisa entregar', () => {
    const lista = listaValida();
    delete (lista['Produtos'] as Record<string, unknown>[])[0]?.['CodigoProduto'];

    expect(checkoutListaProdutosSchema.safeParse(lista).success).toBe(false);
  });
});
