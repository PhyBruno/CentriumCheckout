import { z } from 'zod';
import { centavos } from '../../client/domain/precificacao/dinheiro';
import { milesimosDeUnidades } from '../../client/domain/precificacao/quantidade';
import { inteiroErp, numeroErp, semEnvelope } from './erpJson';

/**
 * Validação de fronteira das respostas de `ListaDAVs` e `GetDav` (T002,
 * Constitution IV — `specs/006-importacao-dav/contracts/erp-dav-api.md`).
 *
 * Os nomes e tipos abaixo saem do contrato real (`Fluxograma - Diagrama -
 * Alinhamentos/ApiCentriumOAuth.yaml`, `info.version: 20260827192357`),
 * conferidos campo a campo: nenhum campo é inventado e nenhum campo do
 * contrato é exigido além do que esta feature consome.
 *
 * Como em `produto.schema.ts`, a conversão numérica acontece **na fronteira**:
 * nenhum `double` de preço ou quantidade atravessa para dentro do domínio
 * (Constitution V). Os objetos são `loose` pelo mesmo motivo dos demais
 * schemas — o Checkout valida o que consome e repassa o resto do payload do
 * ERP íntegro, sem reinterpretar (Constitution III).
 *
 * `CheckoutFaturarNFCe` é **o mesmo shape** devolvido por `CarregarNFCe` e
 * `FaturarNFCe` (AD-057): o ERP já gera um rascunho de NFCe vinculado ao DAV.
 * Por isso este schema é reaproveitado sem alteração pela feature 011
 * (recuperação de rascunho), que só troca o endpoint chamado.
 */

/**
 * `number/format: double` do ERP → `Centavos` inteiros.
 *
 * `numeroErp` porque o ERP real serializa decimal como string
 * (`"ValorTotal": "89.50"`, verificado ao vivo em 2026-09-04 — AD-165).
 */
const valorEmCentavos = numeroErp.transform((valor) => centavos(Math.round(valor * 100)));

/** `quantidade` chega em unidades, podendo ser fracionária → `Milesimos`. */
const quantidadeEmMilesimos = numeroErp.transform((valor) => milesimosDeUnidades(valor));

/* ------------------------------------------------------------------ *
 * 1. `GET /ListaDAVs` — `ListaDAVsOutput.CheckoutListaDAVs`
 * ------------------------------------------------------------------ */

/**
 * `CheckoutListaDAVs.DAV_DAV`.
 *
 * **Sem `VendedorNome`** (AD-095) e **sem `Status`/`Ativo`**: nenhum dos três
 * existe no contrato. Modelá-los exigiria inventar dado que o ERP não fornece —
 * a ausência é o comportamento correto, e é o que faz a coluna "Status" e os
 * filtros de status/vendedor/tipo/origem do Pencil ficarem de fora da UI.
 *
 * `Senha` existe no contrato e passa íntegro pelo `looseObject`, mas não é
 * modelado: nenhum requisito do Checkout o consome.
 */
export const davDaListaSchema = z.looseObject({
  NumeroDAV: z.string(),
  Titulo: z.string(),
  /** `format: date` — `YYYY-MM-DD`. */
  DataEmissao: z.string(),
  ClienteCodigo: inteiroErp,
  ClienteNome: z.string(),
  VendedorCodigo: inteiroErp,
  /** `double` do ERP → centavos; só exibição na lista, nunca entra no cálculo. */
  ValorTotal: valorEmCentavos,
});

export const checkoutListaDavsSchema = z.looseObject({
  PaginaAtual: inteiroErp,
  RegistrosPorPagina: inteiroErp,
  TotalRegistros: inteiroErp,
  TotalPaginas: inteiroErp,
  DAV: z.array(davDaListaSchema),
});

/**
 * `GET /ApiCentriumOAuth/ListaDAVs` — **sem** o envelope `CheckoutListaDAVs`
 * do YAML: o ERP real devolve `DAV`/`PaginaAtual`/`TotalRegistros` na raiz
 * (verificado ao vivo em 2026-09-04 — AD-165). Diferente de `GetDav` logo
 * abaixo, que **mantém** o envelope porque também devolve `messages`.
 */
export const listaDavsOutputSchema = semEnvelope('CheckoutListaDAVs', checkoutListaDavsSchema);

/* ------------------------------------------------------------------ *
 * 2. `GET /GetDav` — `GetDavOutput.OutCheckoutFaturarNFCe`
 * ------------------------------------------------------------------ */

/**
 * `CheckoutFaturarNFCe.produtos_produtosItem`.
 *
 * **Sem campo de descrição** (AD-096): o documento traz só o código. A
 * descrição é resolvida best-effort por `GetProduto` depois da importação, e
 * essa chamada **nunca** revisita o preço — o preço da linha importada é sempre
 * o do documento.
 */
export const produtoDoDocumentoSchema = z.looseObject({
  sequencial: inteiroErp,
  codigoProduto: z.string(),
  quantidade: quantidadeEmMilesimos,
  /** Congelado: nunca passa por `resolvePrecoUnitario` (AD-067). */
  precoUnitario: valorEmCentavos,
  DescontoPercentual: numeroErp,
  /** Absoluto, já resolvido pelo ERP. */
  DescontoValor: valorEmCentavos,
  UDM: z.string(),
});

/** `CheckoutFaturarNFCe.FormasDePagamento_FormasDePagamentoItem`. */
export const formaDePagamentoDoDocumentoSchema = z.looseObject({
  FormaCodigo: inteiroErp,
  FormaMeioPagtoNFe: z.string(),
  FormaValor: valorEmCentavos,
  TEFidentificacao: numeroErp,
  TEFCNPJ: z.string(),
  TEFBandeira: z.string(),
  TEFNumeroAutorizacao: z.string(),
  TEFTipoIntegracao: z.string(),
  FormaPixGUID: z.string(),
  TicketDevolucao: z.string(),
});

/**
 * `CheckoutFaturarNFCe` — documento completo, origem única de `VendaImportada`.
 *
 * **`NumeroNota` é obrigatório e é o único elo com o DAV de origem** (D8,
 * AD-107): o campo `DavNum` saiu do contrato em `20260827192357` e o ERP
 * reconhece sozinho, pelo rascunho identificado por este número, que a NFCe
 * nasceu de um DAV. Uma resposta sem `NumeroNota` é erro de fronteira, não
 * dado opcional — importar assim quebraria o vínculo em silêncio, e o DAV
 * jamais fecharia no ERP ao faturar.
 *
 * `FormaIntegracaoCartao`/`FormaFpgUtiCar`/`FormaEntrada` existem no contrato e
 * passam íntegros pelo `looseObject`, mas não são modelados: o tratamento deles
 * pertence à feature 008 (item 36 de `.specs/project/PENDENCIES.md`).
 * `NotaFiscal` idem — só é relevante depois de `FaturarNFCe`, nunca na
 * importação.
 */
export const checkoutFaturarNFCeSchema = z.looseObject({
  clienteCodigo: inteiroErp,
  vendedorCodigo: inteiroErp,
  CondicaoPagamentoCodigo: inteiroErp,
  NumeroNota: inteiroErp,
  produtos: z.array(produtoDoDocumentoSchema),
  FormasDePagamento: z.array(formaDePagamentoDoDocumentoSchema),
});

/**
 * `GET /ApiCentriumOAuth/GetDav` — **mantém** o envelope, ao contrário de
 * `ListaDAVs`/`GetProduto`/`GetCliente`.
 *
 * Não é inconsistência do ERP: o envelope sobrevive exatamente nos endpoints
 * que também devolvem `messages` (`GetDav` e `FaturarNFCe`); onde a procedure
 * tem um único parâmetro de saída, o GeneXus serializa o SDT na raiz. Os dois
 * casos foram verificados um a um ao vivo em 2026-09-04 (AD-165) — daí
 * `z.looseObject` aqui e `semEnvelope` lá.
 *
 * `produtos` e `FormasDePagamento` seguem **obrigatórios**: uma recusa de
 * negócio do ERP (DAV não liberado, por exemplo) volta `200` com o SDT zerado e
 * sem essas coleções, e aceitá-la importaria um documento vazio, com
 * `clienteCodigo: 0`, como se fosse sucesso. Falhar na fronteira é o desfecho
 * correto — o que falta é exibir a `messages[].Description` do ERP em vez do
 * erro genérico (item registrado em `.specs/project/PENDENCIES.md`).
 */
export const getDavOutputSchema = z.looseObject({
  OutCheckoutFaturarNFCe: checkoutFaturarNFCeSchema,
});

export type DavDaLista = z.infer<typeof davDaListaSchema>;
export type CheckoutListaDavs = z.infer<typeof checkoutListaDavsSchema>;
export type ProdutoDoDocumento = z.infer<typeof produtoDoDocumentoSchema>;
export type FormaDePagamentoDoDocumento = z.infer<typeof formaDePagamentoDoDocumentoSchema>;
export type CheckoutFaturarNFCe = z.infer<typeof checkoutFaturarNFCeSchema>;
