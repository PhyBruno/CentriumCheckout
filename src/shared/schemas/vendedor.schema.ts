import { z } from 'zod';
import { inteiroErp, semEnvelope } from './erpJson';

/**
 * Validação de fronteira da resposta de `GetListaVendedores` (T002,
 * Constitution IV, `contracts/erp-vendedor-api.md`).
 *
 * Os objetos são *loose* pelo mesmo motivo de `cliente.schema.ts` e
 * `produto.schema.ts`: o Checkout valida só o que consome e não reinterpreta o
 * resto do payload do ERP (Constitution III).
 *
 * **Nenhum campo de status/`Ativo` e nenhum campo de função/cargo** é declarado
 * aqui — não é omissão de mapeamento: `CheckoutListaVendedores.Vendedores_Vendedores`
 * não os tem, e `GetListaVendedores` não aceita parâmetro de filtro por status
 * (AD-103, mesma lacuna já registrada para cliente em AD-093). Declará-los para
 * alimentar o chip "Ativo" e o subtítulo de função que o Pencil desenha seria
 * exibir dado que o ERP não fornece.
 *
 * **Não existe `GetVendedor` (singular)** no contrato: `GetListaVendedores` é o
 * único endpoint de vendedor, e por isso o item da lista é usado **direto** para
 * montar o `VendedorVenda` (`research.md` D1) — ao contrário de cliente/produto,
 * em que a lista só capta e um endpoint singular resolve.
 */

/** `CheckoutListaVendedores.Vendedores_Vendedores` — item da listagem. */
export const vendedorDaListaSchema = z.looseObject({
  /** `int64` — chega como string (`"21"`) no ERP real, número no `erp-mock` (AD-165). */
  VendedorCodigo: inteiroErp,
  VendedorNome: z.string(),
  /** Exibido como coluna "CPF" na tabela do modal. */
  VendedorCGC: z.string(),
  /** Presente no contrato; **não** exibido — o desenho não tem coluna de telefone. */
  VendedorFone: z.string(),
});

export const checkoutListaVendedoresSchema = z.looseObject({
  PaginaAtual: inteiroErp,
  RegistrosPorPagina: inteiroErp,
  TotalRegistros: inteiroErp,
  TotalPaginas: inteiroErp,
  Vendedores: z.array(vendedorDaListaSchema),
});

/**
 * `GET /ApiCentriumOAuth/GetListaVendedores` — o ERP real devolve o SDT **na
 * raiz**, sem o envelope `CheckoutListaVendedores` que o YAML desenha (AD-165,
 * `erpJson.ts`). `semEnvelope` aceita as duas formas e entrega sempre a lista.
 */
export const getListaVendedoresOutputSchema = semEnvelope(
  'CheckoutListaVendedores',
  checkoutListaVendedoresSchema,
);

export type VendedorDaLista = z.infer<typeof vendedorDaListaSchema>;
export type CheckoutListaVendedores = z.infer<typeof checkoutListaVendedoresSchema>;
