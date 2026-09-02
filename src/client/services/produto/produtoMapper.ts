/**
 * `SDTCheckout_GetProduto` já validado → `SnapshotPrecoProduto` (T005).
 *
 * Uma função e só: adaptar a forma do ERP à forma do domínio. Nenhuma conversão
 * numérica acontece aqui — `double → Centavos/Milesimos` já foi feita na
 * fronteira Zod (`produto.schema.ts`), então este módulo nunca vê ponto
 * flutuante.
 */

import type { SnapshotPrecoProduto } from '../../domain/precificacao/linha';
import type { SdtCheckoutGetProduto } from '../../../shared/schemas/produto.schema';

export function paraSnapshotPrecoProduto(
  produto: SdtCheckoutGetProduto,
): SnapshotPrecoProduto {
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
