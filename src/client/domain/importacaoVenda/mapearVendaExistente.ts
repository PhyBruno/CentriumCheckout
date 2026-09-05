/**
 * Tradução de um documento já existente no ERP (`CheckoutFaturarNFCe`) para o
 * modelo de carrinho do Checkout (T003,
 * `specs/006-importacao-dav/contracts/importacao-domain-api.md` §1).
 *
 * Domínio **puro**: sem rede, sem Zustand, sem React. Mora em
 * `domain/importacaoVenda/`, e não em `domain/precificacao/`, porque não é
 * lógica de preço — é tradução de shape de API. Nada aqui soma, desconta ou
 * arredonda: os valores chegam já resolvidos pelo ERP, em centavos inteiros
 * convertidos na fronteira Zod, e são copiados como estão (Constitution V).
 *
 * É reaproveitado pela feature 011 (recuperação de rascunho de NFCe): a única
 * diferença entre as duas features é qual endpoint alimenta
 * `CheckoutFaturarNFCe` — `GetDav` aqui, `CarregarNFCe` lá. Por isso
 * `mapearVendaExistente` não conhece a palavra "DAV" em lugar nenhum: a origem
 * aparece só em `paraLinhaCarrinho`, na conversão para linha de carrinho.
 *
 * A 011 chegou (AD-166) e `paraLinhaCarrinho` recebeu o parâmetro `origem` que
 * a ressalva anterior deste comentário previa: o grau de liberdade deixou de
 * ser especulativo no instante em que passou a existir um segundo call site.
 */

import type { Centavos } from '../precificacao/dinheiro';
import { ZERO_CENTAVOS } from '../precificacao/dinheiro';
import type { LinhaCarrinho } from '../precificacao/linha';
import type { Milesimos } from '../precificacao/quantidade';
import { ZERO_MILESIMOS } from '../precificacao/quantidade';
import type { CheckoutFaturarNFCe } from '../../../shared/schemas/dav.schema';

/** Contrato violado pela resposta do ERP — não é dado de negócio ausente. */
export class ErroDocumentoImportadoInvalido extends Error {
  constructor(campo: string) {
    super(
      `Documento importado sem \`${campo}\`: o ERP devolveu uma resposta que não permite iniciar a venda.`,
    );
    this.name = 'ErroDocumentoImportadoInvalido';
  }
}

export interface LinhaImportada {
  readonly codigoProduto: string;
  /**
   * `null` até a resolução best-effort por `GetProduto` (AD-096) — o documento
   * não traz descrição. Nunca bloqueia a importação: a linha entra no carrinho
   * com o código no lugar do nome e é atualizada depois, se a chamada vier.
   */
  readonly descricao: string | null;
  readonly quantidade: Milesimos;
  /** Congelado: nunca passa por `resolvePrecoUnitario` (AD-067, `FR-006`). */
  readonly precoUnitario: Centavos;
  /** Absoluto sobre o total da linha, já resolvido pelo ERP. */
  readonly descontoLinha: Centavos;
  readonly udm: string;
}

export interface TefImportado {
  readonly identificacao: number;
  readonly cnpj: string;
  readonly bandeira: string;
  readonly numeroAutorizacao: string;
  readonly tipoIntegracao: string;
}

export interface FormaPagamentoImportada {
  readonly formaCodigo: number;
  readonly formaMeioPagtoNFe: string;
  readonly valor: Centavos;
  /** `null` quando o item não é TEF — o agrupamento evita cinco campos soltos. */
  readonly tef: TefImportado | null;
  readonly pixGuid: string | null;
  readonly ticketDevolucao: string | null;
}

export interface VendaImportada {
  /**
   * Reenviado **intacto** em `FaturarNFCe` (NFCE-02). Único elo com o documento
   * de origem desde a remoção de `DavNum` (AD-107): é por este rascunho que o
   * ERP reconhece a origem e fecha o DAV sozinho ao faturar (AD-058).
   */
  readonly numeroNota: number;
  /** Sempre sobrescreve o cliente atual da venda (`FR-007`). */
  readonly clienteCodigo: number;
  /** Capturado da linha da listagem (D4) — `GetDav` não devolve o nome. */
  readonly clienteNome: string;
  /** Sempre sobrescreve o vendedor atual da venda (`FR-007`). */
  readonly vendedorCodigo: number;
  /**
   * Nome do vendedor, quando a listagem de origem o devolve — `null` quando
   * não.
   *
   * O documento **nunca** o traz, nas duas features: nem `GetDav` nem
   * `CarregarNFCe` têm campo de nome de vendedor. Quem tem é a listagem, e só
   * uma das duas: `ListaDAVs` devolve só o código (AD-095), mas
   * `GetListaNFCes` devolve o nome por extenso. Por isso o campo vem de
   * `origemLista`, e não da resposta — e é `null` para DAV e preenchido para
   * rascunho de NFCe.
   */
  readonly vendedorNome: string | null;
  readonly linhas: readonly LinhaImportada[];
  readonly formasDePagamento: readonly FormaPagamentoImportada[];
}

/** Campo de texto vazio no ERP significa "não informado", não string vazia. */
function ouNulo(valor: string): string | null {
  return valor === '' ? null : valor;
}

/**
 * Um item de pagamento só é TEF quando o ERP preencheu a identificação.
 *
 * `TEFidentificacao === 0` é o default do SDT GeneXus para item não-TEF — os
 * demais campos `TEF*` vêm vazios junto. Agrupar mesmo assim criaria um
 * `TefImportado` de campos em branco que a feature 008 teria de distinguir de
 * um TEF real.
 */
function paraTef(item: CheckoutFaturarNFCe['FormasDePagamento'][number]): TefImportado | null {
  if (item.TEFidentificacao === 0) {
    return null;
  }
  return {
    identificacao: item.TEFidentificacao,
    cnpj: item.TEFCNPJ,
    bandeira: item.TEFBandeira,
    numeroAutorizacao: item.TEFNumeroAutorizacao,
    tipoIntegracao: item.TEFTipoIntegracao,
  };
}

/**
 * @param origemLista Linha selecionada na listagem, quando houve uma. `null`
 * quando a origem não veio de uma lista — nesse caso os nomes saem vazios e
 * quem consome resolve. `vendedorNome` é opcional porque só uma das duas
 * listagens o devolve (`GetListaNFCes` sim, `ListaDAVs` não, AD-095).
 *
 * Nunca lança por dado de negócio ausente (documento sem forma de pagamento,
 * sem produto): devolve arrays vazios. Lança **só** por violação de contrato —
 * `clienteCodigo`, `vendedorCodigo` ou `NumeroNota` ausentes.
 */
export function mapearVendaExistente(
  resposta: CheckoutFaturarNFCe,
  origemLista: {
    readonly clienteNome: string;
    readonly vendedorNome?: string | null;
  } | null,
): VendaImportada {
  // Reforço em runtime da invariante que o schema Zod já expressa em tipo. A
  // entrada pode chegar de um caller não totalmente tipado (a resposta crua do
  // ERP, um teste, a futura 011): sem esta checagem, um `NumeroNota` ausente
  // viraria `undefined` no payload de `FaturarNFCe` e o DAV nunca fecharia no
  // ERP — falha silenciosa, detectável só na conferência fiscal (D8/AD-107).
  if (typeof resposta.NumeroNota !== 'number') {
    throw new ErroDocumentoImportadoInvalido('NumeroNota');
  }
  if (typeof resposta.clienteCodigo !== 'number') {
    throw new ErroDocumentoImportadoInvalido('clienteCodigo');
  }
  if (typeof resposta.vendedorCodigo !== 'number') {
    throw new ErroDocumentoImportadoInvalido('vendedorCodigo');
  }

  return {
    numeroNota: resposta.NumeroNota,
    clienteCodigo: resposta.clienteCodigo,
    clienteNome: origemLista?.clienteNome ?? '',
    vendedorCodigo: resposta.vendedorCodigo,
    // `ouNulo` porque nome em branco na listagem é "não informado", não string
    // vazia: um `''` chegaria ao slice de vendedor e a UI exibiria um vendedor
    // sem nome em vez de cair no comportamento de "só o código".
    vendedorNome: ouNulo(origemLista?.vendedorNome ?? ''),
    linhas: resposta.produtos.map((produto) => ({
      codigoProduto: produto.codigoProduto,
      descricao: null,
      quantidade: produto.quantidade,
      precoUnitario: produto.precoUnitario,
      descontoLinha: produto.DescontoValor,
      udm: produto.UDM,
    })),
    formasDePagamento: resposta.FormasDePagamento.map((item) => ({
      formaCodigo: item.FormaCodigo,
      formaMeioPagtoNFe: item.FormaMeioPagtoNFe,
      valor: item.FormaValor,
      tef: paraTef(item),
      pixGuid: ouNulo(item.FormaPixGUID),
      ticketDevolucao: ouNulo(item.TicketDevolucao),
    })),
  };
}

/**
 * Origem de uma linha nascida de um documento já existente no ERP.
 *
 * As duas features que importam documento (`GetDav`/006 e `CarregarNFCe`/011)
 * produzem linhas idênticas em tudo — congeladas, sem reprecificação — menos
 * neste rótulo, que é o que a grid e a auditoria leem para dizer de onde a
 * venda veio.
 */
export type OrigemDocumentoImportado = 'DAV' | 'RASCUNHO';

/**
 * Converte uma linha importada em `LinhaCarrinho` (`data-model.md` §3).
 *
 * `idLinha` é **parâmetro**, não gerado aqui: o domínio puro não conhece
 * `crypto`, e o `CarrinhoSlice` já expõe um gerador injetável (`gerarIdLinha`)
 * que é o que torna o id determinístico em teste. `origem` é parâmetro pela
 * razão oposta: é a **única** coisa que distingue uma linha de DAV (006) de uma
 * linha de rascunho de NFCe (011), e fixá-la aqui obrigaria a duplicar a função
 * inteira para mudar um literal (AD-166).
 *
 * O desconto do documento entra em `descontoManual`, não em `descontoConvenio`.
 * `descontoConvenio` é campo **derivado** — `repricarSku` o reescreve a cada
 * reprecificação (`linha.ts`). Enquanto congelada a linha fica fora do
 * agregado e nada a reescreveria; mas basta o operador editá-la para ela
 * descongelar (invariante I6), e aí a primeira reprecificação apagaria o
 * desconto que veio do documento. Em `descontoManual` ele sobrevive, que é o
 * comportamento correto: é um desconto já concedido e registrado no ERP, não um
 * convênio a recalcular sob o cliente atual.
 */
export function paraLinhaCarrinho(
  linha: LinhaImportada,
  idLinha: string,
  origem: OrigemDocumentoImportado,
): LinhaCarrinho {
  return {
    idLinha,
    snapshot: {
      codigoProduto: linha.codigoProduto,
      // Fallback: o código no lugar do nome, nunca string vazia — a linha
      // precisa ser identificável na grid antes de `GetProduto` responder.
      descricao: linha.descricao ?? linha.codigoProduto,
      unidadeMedida: linha.udm,
      precoBase: linha.precoUnitario,
      // `TipoPreco = 8` não se aplica a linha congelada: ela nunca entra em
      // `repricarSku`, então estas faixas jamais são lidas (invariante I3).
      precosFaixa: [
        ZERO_CENTAVOS,
        ZERO_CENTAVOS,
        ZERO_CENTAVOS,
        ZERO_CENTAVOS,
        ZERO_CENTAVOS,
      ] as const,
      limiaresFaixa: [ZERO_MILESIMOS, ZERO_MILESIMOS, ZERO_MILESIMOS, ZERO_MILESIMOS] as const,
      // Linha congelada não reabre edição de pesagem.
      pesavelEditavel: '',
    },
    quantidade: linha.quantidade,
    precoUnitario: linha.precoUnitario,
    descontoConvenio: ZERO_CENTAVOS,
    descontoManual: linha.descontoLinha,
    cancelada: false,
    // Invariante I5: derivado da origem, nunca informado pelo call site.
    precoCongelado: true,
    origem,
  };
}
