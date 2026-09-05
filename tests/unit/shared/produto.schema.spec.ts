import { describe, expect, it } from 'vitest';
import {
  checkoutListaProdutosSchema,
  getListaProdutosOutputSchema,
  getProdutoOutputSchema,
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

  /**
   * Shape **real** do `GetProduto` (AD-165), verificado ao vivo em 2026-09-04:
   * todo `double` chega como string JSON (`"PrecoVenda1": "1.0000"`). Antes
   * desta correção **toda** inserção de produto contra o ERP real virava
   * `ErroRespostaInvalida` — a feature 003 inteira ficava bloqueada.
   */
  it('aceita preço como string numérica, como o ERP real devolve (AD-165)', () => {
    const produto = sdtCheckoutGetProdutoSchema.parse(
      respostaGetProduto({ PrecoVenda: '84.3530', PrecoVenda1: '1.0000' }),
    );

    expect(produto.PrecoVenda).toBe(8435);
    expect(produto.PrecoVenda1).toBe(100);
  });

  it('recusa PrecoVenda em formato não numérico', () => {
    expect(
      sdtCheckoutGetProdutoSchema.safeParse(respostaGetProduto({ PrecoVenda: 'dez reais' }))
        .success,
    ).toBe(false);
  });

  it('recusa PrecoVenda vazio — string vazia viraria R$ 0,00 em silêncio', () => {
    expect(
      sdtCheckoutGetProdutoSchema.safeParse(respostaGetProduto({ PrecoVenda: '' })).success,
    ).toBe(false);
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
    expect(checkoutListaProdutosSchema.safeParse({ ...listaValida(), Produtos: [] }).success).toBe(
      true,
    );
  });

  it('recusa candidato sem CodigoProduto — é o único campo que a busca precisa entregar', () => {
    const lista = listaValida();
    delete (lista['Produtos'] as Record<string, unknown>[])[0]?.['CodigoProduto'];

    expect(checkoutListaProdutosSchema.safeParse(lista).success).toBe(false);
  });

  /**
   * AD-165 — o ERP real devolve `GetProduto`/`GetListaProdutos` **sem** o
   * envelope nomeado do `ApiCentriumOAuth.yaml`. As duas formas precisam passar:
   * a real (raiz) e a do YAML, que é a que o `erp-mock` das suítes E2E produz.
   */
  describe('envelope opcional (AD-165)', () => {
    it('aceita GetProduto na raiz, como o ERP real devolve', () => {
      expect(getProdutoOutputSchema.parse(respostaGetProduto()).CodigoProduto).toBe('001234');
    });

    it('aceita GetProduto dentro do envelope Produto, como o YAML e o erp-mock', () => {
      const validado = getProdutoOutputSchema.parse({
        Produto: respostaGetProduto(),
        messages: [],
      });

      expect(validado.CodigoProduto).toBe('001234');
    });

    it('aceita GetListaProdutos na raiz, como o ERP real devolve', () => {
      expect(getListaProdutosOutputSchema.parse(listaValida()).Produtos).toHaveLength(1);
    });

    it('aceita GetListaProdutos dentro do envelope ListaProdutos', () => {
      const validado = getListaProdutosOutputSchema.parse({
        ListaProdutos: listaValida(),
        messages: [],
      });

      expect(validado.TotalRegistros).toBe(137);
    });
  });
});
