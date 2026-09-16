/**
 * `SDTCheckout_GetProduto` já validado → forma do domínio (T005, AD-236).
 *
 * Só adapta a forma do ERP à forma do domínio. Nenhuma conversão numérica
 * acontece aqui — `double → Centavos/Milesimos/SaldoMilesimos` já foi feita na
 * fronteira Zod (`produto.schema.ts`), então este módulo nunca vê ponto
 * flutuante.
 */

import type { SaldoMilesimos } from '../../domain/estoque/saldoProduto';
import type { SnapshotPrecoProduto } from '../../domain/precificacao/linha';
import type { SdtCheckoutGetProduto } from '../../../shared/schemas/produto.schema';

/**
 * Produto resolvido por `GetProduto`: o snapshot de preço, que a linha copia e
 * congela, e o saldo, que **não** vai para a linha (AD-236).
 *
 * Campos separados de propósito: o snapshot fica no cache da venda
 * (`staleTime` infinito, `CART-03`), e o saldo guardado junto dele é só o
 * "último conhecido" — quem decide inserção reconsulta (`consultarSaldoProduto`).
 */
export interface ResolucaoProduto {
  readonly snapshot: SnapshotPrecoProduto;
  /** `null` quando o ERP não devolveu `Saldo`. */
  readonly saldo: SaldoMilesimos | null;
}

export function paraSnapshotPrecoProduto(produto: SdtCheckoutGetProduto): SnapshotPrecoProduto {
  return {
    codigoProduto: produto.CodigoProduto,
    descricao: produto.Descricao,
    unidadeMedida: produto.UDM,
    precoBase: produto.PrecoVenda,
    precosFaixa: [
      produto.PrecoVenda1,
      produto.PrecoVenda2,
      produto.PrecoVenda3,
      produto.PrecoVenda4,
      produto.PrecoVenda5,
    ],
    limiaresFaixa: [
      produto.QtdMinimaPreco2,
      produto.QtdMinimaPreco3,
      produto.QtdMinimaPreco4,
      produto.QtdMinimaPreco5,
    ],
    pesavelEditavel: produto.ProdutoPesavelEditavel,
  };
}

export function paraResolucaoProduto(produto: SdtCheckoutGetProduto): ResolucaoProduto {
  return {
    snapshot: paraSnapshotPrecoProduto(produto),
    saldo: produto.Saldo ?? null,
  };
}
