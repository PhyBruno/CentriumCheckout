import { z } from 'zod';
import { centavos } from '../../client/domain/precificacao/dinheiro';
import { milesimosDeUnidades } from '../../client/domain/precificacao/quantidade';

/**
 * Validação de fronteira das respostas de `GetProduto` e `GetListaProdutos`
 * (T004, Constitution IV, `contracts/erp-produto-api.md`).
 *
 * Além de validar o shape, o schema faz a conversão numérica **na fronteira**:
 * nenhum `double` de preço atravessa para dentro do domínio. Um `double` de
 * preço só existe entre a resposta HTTP e o `.transform()` abaixo
 * (`research.md`, D4).
 *
 * Mora em `src/shared/` por convenção do projeto (todos os schemas Zod ficam
 * aqui), mas importa os branded types de `src/client/domain/precificacao/` — a
 * dependência aponta só nesse sentido, e o domínio não conhece Zod.
 *
 * Os objetos são *loose* pelo mesmo motivo de `bootstrap.schema.ts`: o Checkout
 * valida o que consome e repassa o resto do payload do ERP íntegro, sem
 * reinterpretar (Constitution III).
 */

/** `number/format: double` do ERP → `Centavos` inteiros. */
const precoEmCentavos = z.number().transform((valor) => centavos(Math.round(valor * 100)));

/** `QtdMinimaPreco2..5` chegam como unidades inteiras (`int64`) → `Milesimos`. */
const unidadesEmMilesimos = z
  .number()
  .int()
  .transform((valor) => milesimosDeUnidades(valor));

/**
 * `ProdutoPesavelEditavel` restrito aos quatro valores discretos do campo
 * (AD-070). Um quinto valor é **erro de fronteira**, não um comportamento
 * silencioso a mais.
 */
export const pesavelEditavelSchema = z.enum(['S', 'B', '', 'E']);

/** `SDTCheckout_GetProduto` — a única origem possível de `SnapshotPrecoProduto`. */
export const sdtCheckoutGetProdutoSchema = z.looseObject({
  CodigoProduto: z.string(),
  Descricao: z.string(),
  UDM: z.string(),
  /** Preço já resolvido pelo ERP — usado para todo `TipoPreco ≠ 8` (AD-059/AD-060). */
  PrecoVenda: precoEmCentavos,
  PrecoVenda1: precoEmCentavos,
  PrecoVenda2: precoEmCentavos,
  PrecoVenda3: precoEmCentavos,
  PrecoVenda4: precoEmCentavos,
  PrecoVenda5: precoEmCentavos,
  QtdMinimaPreco2: unidadesEmMilesimos,
  QtdMinimaPreco3: unidadesEmMilesimos,
  QtdMinimaPreco4: unidadesEmMilesimos,
  QtdMinimaPreco5: unidadesEmMilesimos,
  ProdutoPesavelEditavel: pesavelEditavelSchema,
});

/** Envelope de `GET /ApiCentriumOAuth/GetProduto` (`GetProdutoOutput` do yaml). */
export const getProdutoOutputSchema = z.looseObject({
  Produto: sdtCheckoutGetProdutoSchema,
});

/**
 * Candidato do modal de busca.
 *
 * Só os campos que a lista pode legitimamente fornecer: exibir e escolher. Não
 * há `PrecoVenda` nem `ProdutoPesavelEditavel` neste schema porque o ERP não os
 * devolve aqui — montar uma `LinhaCarrinho` a partir da busca é proibido
 * (AD-091, `research.md` D1).
 */
export const produtoDaListaSchema = z.looseObject({
  CodigoProduto: z.string(),
  Descricao: z.string(),
  Referencia: z.string(),
  CodigoBarras: z.string(),
  UDM: z.string(),
});

export const checkoutListaProdutosSchema = z.looseObject({
  PaginaAtual: z.number().int(),
  RegistrosPorPagina: z.number().int(),
  TotalRegistros: z.number().int(),
  TotalPaginas: z.number().int(),
  Produtos: z.array(produtoDaListaSchema),
});

/** Envelope de `GET /ApiCentriumOAuth/GetListaProdutos`. */
export const getListaProdutosOutputSchema = z.looseObject({
  ListaProdutos: checkoutListaProdutosSchema,
});

export type SdtCheckoutGetProduto = z.infer<typeof sdtCheckoutGetProdutoSchema>;
export type ProdutoDaLista = z.infer<typeof produtoDaListaSchema>;
export type CheckoutListaProdutos = z.infer<typeof checkoutListaProdutosSchema>;
