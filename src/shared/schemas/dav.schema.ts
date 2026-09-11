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
 * **Sem `Status`/`Ativo`**: nenhum dos dois existe no contrato. Modelá-los
 * exigiria inventar dado que o ERP não fornece — a ausência é o comportamento
 * correto, e é o que faz a coluna "Status" e os filtros de status/tipo/origem
 * do Pencil ficarem de fora da UI.
 *
 * **`VendedorNome` passou a existir em 2026-09-08** (AD-172), acrescentado ao
 * SDT `CheckoutListaDAVs` na KB do ERP — o que supera a ausência que AD-095
 * registrava e fecha o "Vendedor #<código>" da janela de importação.
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
  /**
   * `optional()` **de propósito**, e não porque o contrato o permita: o campo
   * já existe na KB mas o build/deploy do ERP ainda não saiu, então a resposta
   * em produção segue sem ele por enquanto. Exigi-lo derrubaria a listagem
   * inteira na fronteira — uma feature que funciona hoje pararia por causa de
   * um dado de exibição. Quem lê trata a ausência como "não informado".
   */
  VendedorNome: z.string().optional(),
  /** `double` do ERP → centavos; só exibição na lista, nunca entra no cálculo. */
  ValorTotal: valorEmCentavos,
});

export const checkoutListaDavsSchema = z.looseObject({
  PaginaAtual: inteiroErp,
  RegistrosPorPagina: inteiroErp,
  TotalRegistros: inteiroErp,
  TotalPaginas: inteiroErp,
  /** Ausente na busca sem resultado — ver `Clientes` em `cliente.schema.ts`. */
  DAV: z.array(davDaListaSchema).optional().default([]),
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
  /**
   * Nome do vendedor do documento (AD-172, 2026-09-08).
   *
   * Acrescentado ao SDT `CheckoutFaturarNFCe` na KB, ao lado de
   * `vendedorCodigo` — logo vale para `GetDav` **e** `CarregarNFCe`, que
   * devolvem o mesmo SDT (AD-057/AD-117). Antes disso o Checkout não tinha
   * nenhuma fonte para o nome e fixava `null` (AD-095).
   *
   * `optional()` pelo mesmo motivo de `VendedorNome` na listagem: a KB já tem o
   * campo, o deploy do ERP ainda não. Exigi-lo transformaria um dado de
   * exibição em erro de fronteira e derrubaria a importação inteira.
   *
   * **Ignorado na entrada.** Este mesmo schema descreve o corpo que
   * `montarRetratoVenda` envia a `FaturarNFCe`/`ValidarNFCe`, e lá o vendedor de
   * registro é `vendedorCodigo`: o Checkout nunca devolve este campo ao ERP,
   * para não criar uma segunda fonte de verdade do mesmo dado.
   */
  vendedorNome: z.string().optional(),
  CondicaoPagamentoCodigo: inteiroErp,
  NumeroNota: inteiroErp,
  /**
   * **Obrigatório, e é ele quem separa documento de recusa.** Um documento
   * importável sempre tem ao menos um item; o SDT zerado que o ERP devolve ao
   * recusar (DAV não liberado, rascunho inexistente) nunca traz esta chave.
   * Com `FormasDePagamento` agora opcional, `produtos` é a única guarda que
   * impede uma recusa de virar importação silenciosa de documento vazio.
   */
  produtos: z.array(produtoDoDocumentoSchema),
  /**
   * **Ausente quando o documento não tem pagamento lançado** — que é o estado
   * normal de um DAV, gerado antes de qualquer cobrança. O ERP não devolve
   * `[]`: omite a chave, o mesmo comportamento já registrado em AD-216 para as
   * listagens. Medido ao vivo em 2026-09-11 (`GetDav` do DAV 5881, tenant
   * `c0lj6mvzeh`): resposta com `produtos` de dois itens e **sem**
   * `FormasDePagamento`.
   *
   * Exigi-la reprovava na fronteira exatamente o caminho feliz da importação —
   * o operador via "resposta inválida" para um DAV que o ERP tinha entregue
   * inteiro. Quem lê trata a ausência como "nada pago ainda".
   */
  FormasDePagamento: z.array(formaDePagamentoDoDocumentoSchema).optional().default([]),
});

/**
 * `GET /ApiCentriumOAuth/GetDav` — **sem** envelope no caminho de sucesso, como
 * todo o resto do `ApiCentriumOAuth`.
 *
 * Isto **corrige** o que AD-165 registrava e este TSDoc afirmava até
 * 2026-09-11: que `GetDav` "mantém o envelope". A afirmação nasceu de uma
 * amostra enviesada — as únicas respostas observadas na época eram recusas de
 * negócio. Medido ao vivo em 2026-09-11 (tenant `c0lj6mvzeh`), o mesmo endpoint
 * responde nas duas formas:
 *
 * - **sucesso** → SDT na raiz, sem envelope e sem `messages`
 *   (`{"Empresa":1,"clienteCodigo":"1007",…,"produtos":[…]}`);
 * - **recusa** → `{"OutCheckoutFaturarNFCe":{…zerado…},"messages":[{…}]}`.
 *
 * O envelope não é propriedade do endpoint: ele aparece quando há `messages` a
 * devolver junto — com a coleção vazia sobra um único parâmetro de saída e o
 * GeneXus serializa o SDT na raiz. É a mesma regra que AD-208 já tinha
 * observado em `FaturarNFCe` e que `CarregarNFCe` exibe nas duas formas.
 *
 * A consequência de exigir o envelope era grave e silenciosa: **toda importação
 * de DAV bem-sucedida** reprovava na fronteira, e o operador via "resposta
 * inválida" para um documento que o ERP entregara inteiro. Só a recusa casava.
 *
 * `semEnvelope` aceita as duas formas e devolve sempre o documento. A guarda
 * contra importar uma recusa como documento vazio passou a ser `produtos`
 * (obrigatório no SDT acima), que o SDT zerado nunca traz — o que falta ainda é
 * exibir a `messages[].Description` do ERP em vez do erro genérico (item
 * registrado em `.specs/project/PENDENCIES.md`).
 */
export const getDavOutputSchema = semEnvelope('OutCheckoutFaturarNFCe', checkoutFaturarNFCeSchema);

export type DavDaLista = z.infer<typeof davDaListaSchema>;
export type CheckoutListaDavs = z.infer<typeof checkoutListaDavsSchema>;
export type ProdutoDoDocumento = z.infer<typeof produtoDoDocumentoSchema>;
export type FormaDePagamentoDoDocumento = z.infer<typeof formaDePagamentoDoDocumentoSchema>;
export type CheckoutFaturarNFCe = z.infer<typeof checkoutFaturarNFCeSchema>;
