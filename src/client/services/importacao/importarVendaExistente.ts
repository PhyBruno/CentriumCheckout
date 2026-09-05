/**
 * Orquestração de "trazer um documento já existente no ERP para a venda em
 * curso" — compartilhada pela importação de DAV (006) e pela recuperação de
 * rascunho de NFCe (011).
 *
 * Nasceu dentro de `services/dav/davQueries.ts`, onde a 006 a escreveu, e mudou
 * de lugar quando a 011 chegou (AD-166). O gatilho da mudança não foi estética:
 * as duas features executam **a mesma** sequência de efeitos sobre os mesmos
 * cinco slices, e a única diferença real é qual endpoint devolve o
 * `CheckoutFaturarNFCe` — `GetDav` numa, `CarregarNFCe` na outra. Mantê-la sob
 * `dav/` obrigaria a 011 a importar de uma pasta que não é a dela, ou a
 * duplicar a sequência; a segunda cópia divergiria da primeira no primeiro
 * ajuste que só uma das duas recebesse.
 *
 * A parametrização é `FonteDocumento`, não um `if (origem === 'DAV')`: acrescentar
 * uma terceira procedência é escrever uma nova fonte, sem tocar aqui
 * (Open/Closed, Constitution II).
 *
 * O módulo continua sem importar `vendaStore`: tudo o que ele muta chega por
 * `ImportacaoVendaDeps`, e quem resolve cada porta contra o Zustand é o hook da
 * feature correspondente (`features/dav/useImportacaoDav.ts`,
 * `features/recuperacao/useRecuperacaoNFCe.ts`). É essa fronteira que a
 * Dependency Inversion protege — nenhum slice conhece os outros.
 */

import type { CheckoutFaturarNFCe } from '../../../shared/schemas/dav.schema';
import type { ClienteCheckout } from '../../../shared/schemas/cliente.schema';
import type { EventoAuditoriaRegistravel } from '../../domain/auditoria/eventos';
import {
  mapearVendaExistente,
  type FormaPagamentoImportada,
  type LinhaImportada,
  type OrigemDocumentoImportado,
  type VendaImportada,
} from '../../domain/importacaoVenda/mapearVendaExistente';
import type { ErpClient } from '../erpClient';

/**
 * Por que a venda em curso não aceita a importação de um documento.
 *
 * Um documento importado **substitui** a venda: traz os itens, o cliente, o
 * vendedor e as formas de pagamento já registrados no ERP, e passa a ser a
 * NFCe rascunho daquela venda. Não existe "mesclar" — `FaturarNFCe` carrega um
 * único `NumeroNota` (`montarRetratoVenda.ts`) e um único cliente. Importar
 * sobre uma venda já em digitação misturaria dois documentos num só, e o
 * operador só descobriria na nota emitida.
 *
 * Regra pedida diretamente pelo usuário (2026-09-03, reafirmada em 2026-09-04
 * ao planejar a 011): um DAV **ou uma NFCe** só entra numa venda que ainda não
 * foi efetivamente iniciada — sem cliente identificado (o default não conta),
 * sem item, sem condição de pagamento e sem forma aplicada. Os quatro critérios
 * estão cobertos pelos campos abaixo; condição e forma vêm juntas em
 * `podeMutar`, que a 008 fecha (`pagamentoSlice.podeMutarCarrinho`).
 */
export type MotivoRecusaImportacao =
  'venda-bloqueada' | 'ja-importou-documento' | 'carrinho-populado' | 'cliente-identificado';

/** Retrato mínimo da venda para decidir a recusa — sem Zustand, sem React. */
export interface EstadoVendaParaImportacao {
  /** `identidadeVenda.numeroNota`; `0` para venda criada do zero. */
  readonly numeroNota: number;
  /**
   * Mesmo predicado de bloqueio do carrinho/cliente (AD-043). Cobre **dois** dos
   * quatro critérios do usuário: é `false` a partir da condição de pagamento
   * escolhida e a partir de qualquer forma aprovada (`pagamentoSlice`, I7
   * ampliada em 2026-09-04).
   */
  readonly podeMutar: boolean;
  /**
   * Linhas no carrinho, **canceladas inclusive** (pedido do usuário,
   * 2026-09-03).
   *
   * A pergunta aqui não é "há o que faturar?", e sim "esta venda já foi
   * digitada?". A linha cancelada permanece no array por rastreabilidade
   * (`CART-08`) e vai junto no `Log` de auditoria e no retrato de
   * `FaturarNFCe`: importar um documento por cima misturaria o que o operador
   * lançou e cancelou com o conteúdo do documento, dentro de uma nota só.
   */
  readonly linhasNaVenda: number;
  /**
   * Houve escolha **explícita** de cliente pelo operador.
   *
   * O default pré-selecionado no início da venda (AD-032) não conta: ele não é
   * decisão do operador, e recusar por causa dele impediria toda importação —
   * a tela de venda nasce com esse cliente aplicado.
   */
  readonly clienteIdentificado: boolean;
}

/**
 * Decide se a venda aceita a importação. Função **pura**: é ela que a UI
 * consulta para recusar já no clique do atalho, e a orquestração reusa antes de
 * qualquer efeito — uma regra só, três pontos de aplicação (atalho, janela,
 * orquestração).
 *
 * A ordem importa: o bloqueio por pagamento vem primeiro porque é o estado mais
 * restritivo, e "já importou" antes dos demais porque explica melhor o que o
 * operador está vendo do que "já tem itens" (os itens são do documento).
 */
export function recusaDeImportacao(
  estado: EstadoVendaParaImportacao,
): MotivoRecusaImportacao | null {
  if (!estado.podeMutar) {
    return 'venda-bloqueada';
  }
  if (estado.numeroNota !== 0) {
    return 'ja-importou-documento';
  }
  if (estado.linhasNaVenda > 0) {
    return 'carrinho-populado';
  }
  if (estado.clienteIdentificado) {
    return 'cliente-identificado';
  }
  return null;
}

/**
 * Texto que o operador lê na notificação — sempre com a saída possível.
 *
 * Fala em "documento", e não em "DAV": a mesma recusa atende as duas janelas, e
 * uma mensagem que citasse DAV apareceria ao operador que tentou recuperar uma
 * NFCe.
 */
export function mensagemDeRecusa(motivo: MotivoRecusaImportacao): string {
  switch (motivo) {
    case 'venda-bloqueada':
      return 'Já há pagamento aprovado nesta venda: não é possível importar um documento.';
    case 'ja-importou-documento':
      return 'Esta venda já foi iniciada a partir de um documento. Cancele a venda para importar outro.';
    case 'carrinho-populado':
      // "lançados", e não "no carrinho": o item cancelado também conta, e o
      // operador que acabou de cancelar a última linha precisa entender por que
      // o atalho continua fechado.
      return 'Esta venda já tem itens lançados, mesmo que cancelados. Cancele a venda para importar um documento.';
    case 'cliente-identificado':
      return 'Esta venda já tem um cliente identificado. Cancele a venda para importar um documento.';
  }
}

export class ErroImportacaoRecusada extends Error {
  constructor(readonly motivo: MotivoRecusaImportacao) {
    super(mensagemDeRecusa(motivo));
    this.name = 'ErroImportacaoRecusada';
  }
}

/**
 * De onde o documento vem e como ele se identifica na trilha — o **único** eixo
 * em que a importação de DAV e a recuperação de NFCe diferem.
 *
 * Cada feature constrói a sua fonte na própria camada de serviço
 * (`services/dav/davQueries.ts`, `services/recuperacao/recuperacaoQueries.ts`),
 * onde mora o conhecimento do endpoint. A orquestração abaixo nunca pergunta
 * qual é a origem para decidir o que fazer: ela só repassa `origem` adiante.
 */
export interface FonteDocumento {
  /** Rótulo propagado às linhas, à identidade da venda e ao cliente. */
  readonly origem: OrigemDocumentoImportado;
  /**
   * Nome do cliente capturado na linha da listagem — nenhum dos dois endpoints
   * de documento devolve o nome, só o código (AD-095/AD-115).
   */
  readonly clienteNome: string;
  /**
   * Nome do vendedor capturado na linha da listagem, ou `null` quando a
   * listagem não o devolve.
   *
   * É **obrigatório** declarar, mesmo sendo `null` para DAV: as duas listagens
   * divergem justamente aqui — `ListaDAVs` só traz o código (AD-095),
   * `GetListaNFCes` traz o nome por extenso —, e um campo opcional deixaria
   * essa diferença passar despercebida ao escrever uma terceira fonte.
   */
  readonly vendedorNome: string | null;
  /** Chamada de rede que devolve o documento completo. */
  carregar(erpClient: ErpClient | undefined): Promise<CheckoutFaturarNFCe>;
  /**
   * Evento registrado ao final, com o documento já mapeado em mãos.
   *
   * É a fonte que decide **qual** evento, e não a orquestração: `DAV_IMPORTADO`
   * e `NFCE_RECUPERADA` são gestos distintos do operador, e um evento único
   * distinguido por um campo obrigaria a inspecionar `detalhes` para ler a
   * trilha.
   */
  eventoDeImportacao(venda: VendaImportada): EventoAuditoriaRegistravel;
}

/**
 * Portas da orquestração (Dependency Inversion —
 * `specs/006-importacao-dav/contracts/importacao-domain-api.md` §3).
 */
export interface ImportacaoVendaDeps {
  /**
   * Retrato da venda em curso. Chamada **duas vezes** por importação: antes da
   * rede, para não gastar chamada ao ERP à toa, e de novo colada nas mutações,
   * para que a janela dos dois `await` não deixe passar um estado que virou no
   * meio (ver `importarVendaExistente`).
   *
   * Precisa ser **lida do estado a cada chamada**, nunca capturada num valor
   * fixo: um retrato congelado tornaria a segunda checagem inútil.
   */
  estadoDaVenda(): EstadoVendaParaImportacao;
  /**
   * Feature 004 — grava `{ origem, numeroNota }` na identidade da venda.
   *
   * **É o elo que faz o documento fechar no ERP.** `montarRetratoVenda` monta o
   * payload de `FaturarNFCe` lendo `NumeroNota` de `identidadeVenda`
   * (`montarRetratoVenda.ts`), e desde a remoção de `DavNum` esse número é o
   * único vínculo com o documento de origem (AD-107). Sem esta chamada a venda
   * importada seria faturada como venda nova, com `NumeroNota: 0`, e o
   * documento ficaria aberto no ERP — sem erro, sem aviso.
   *
   * Não é `abrirSessaoDeVenda` de propósito: aquela função **zera** o histórico
   * de auditoria. Nenhuma das duas features quer isso — ver o comentário sobre
   * a trilha em `importarVendaExistente`.
   */
  definirIdentidadeVenda(identidade: {
    readonly origem: OrigemDocumentoImportado;
    readonly numeroNota: number;
  }): void;
  /** Feature 003 — extensão aditiva do `CarrinhoSlice`. */
  importarLinhasCongeladas(
    linhas: readonly LinhaImportada[],
    origem: OrigemDocumentoImportado,
  ): void;
  /** Feature 003 — metadado de exibição, resolvido em segundo plano. */
  editarSnapshotDescricao(codigoProduto: string, descricao: string): void;
  /** Feature 005 — `GetCliente` por `CodCliente` (AD-115). */
  resolverCliente(codigo: number): Promise<ClienteCheckout>;
  /** Feature 005 — já ligada à origem correta pelo hook que monta as portas. */
  selecionarCliente(cliente: ClienteCheckout): Promise<unknown>;
  /**
   * Feature 012 — sobrescreve o vendedor da venda pelo do documento.
   *
   * A **origem** (`'DAV'`/`'RASCUNHO'`) não entra aqui: quem monta a porta já
   * sabe a procedência e a fecha na ligação com o slice, pela mesma razão de
   * `selecionarCliente` acima. Esta orquestração é genérica quanto à fonte.
   */
  trocarVendedor(vendedor: { readonly codigo: number; readonly nome: string | null }): void;
  /** Feature 008 — formas do documento entram já aprovadas, sem passar pelo gate. */
  importarFormasDePagamento(formas: readonly FormaPagamentoImportada[]): void;
  /** Feature 001 — dispatcher tipado do histórico de auditoria. */
  registrarEventoAuditoria(evento: EventoAuditoriaRegistravel): void;
  /** Feature 003 — `GetProduto`, usado **só** para `Descricao` (AD-096). */
  buscarDescricaoProduto(codigoProduto: string): Promise<string>;
  readonly erpClient?: ErpClient;
}

/**
 * Resolve a descrição de cada SKU distinto do documento, em paralelo e sem
 * bloquear (AD-096).
 *
 * `allSettled`, nunca `all`: uma falha isolada não pode derrubar as demais nem
 * a importação, que a esta altura já terminou. O preço **nunca** é revisitado —
 * só `Descricao` é lida da resposta, e a linha permanece com o preço do
 * documento (`FR-006`).
 */
async function resolverDescricoes(venda: VendaImportada, deps: ImportacaoVendaDeps): Promise<void> {
  const skus = [...new Set(venda.linhas.map((linha) => linha.codigoProduto))];

  await Promise.allSettled(
    skus.map(async (sku) => {
      const descricao = await deps.buscarDescricaoProduto(sku);
      if (descricao !== '') {
        deps.editarSnapshotDescricao(sku, descricao);
      }
    }),
  );
}

/**
 * Traz um documento existente para a venda em andamento (`DAV-02`/`NFCE-01`).
 *
 * **Toda a rede acontece antes de qualquer mutação** — o documento e o
 * `GetCliente` que resolve o cliente dele. É o que satisfaz `FR-010` ao pé da
 * letra: uma falha em qualquer um dos dois deixa o carrinho exatamente como
 * estava, sem meio-documento importado.
 *
 * Uma falha ao resolver o cliente aborta a importação inteira em vez de seguir
 * com o cliente anterior: `FR-007` exige que o cliente do documento substitua o
 * que estiver na venda, e importar itens sob o cliente errado produziria uma
 * NFCe com preço e destinatário divergentes do documento de origem.
 *
 * **A trilha de auditoria existente é preservada**, e o evento da fonte é
 * acrescentado a ela — nenhuma das duas features chama `resetarAuditoria`
 * (AD-137 para a 006, AD-166 para a 011). O motivo é o mesmo nas duas: a
 * pré-condição acima já garante que a venda não foi efetivamente iniciada, de
 * modo que não há histórico de operador a zerar; e emitir `VENDA_INICIADA`
 * aqui afirmaria um início de sessão que não aconteceu — a sessão foi aberta
 * antes, por `abrirSessaoDeVenda`.
 */
export async function importarVendaExistente(
  fonte: FonteDocumento,
  deps: ImportacaoVendaDeps,
): Promise<void> {
  // Pré-condição antes até da rede: não depende do documento, e recusar cedo
  // evita gastar uma chamada ao ERP para depois não ter nada a desfazer.
  const recusa = recusaDeImportacao(deps.estadoDaVenda());
  if (recusa !== null) {
    throw new ErroImportacaoRecusada(recusa);
  }

  const documento = await fonte.carregar(deps.erpClient);
  const venda = mapearVendaExistente(documento, {
    clienteNome: fonte.clienteNome,
    vendedorNome: fonte.vendedorNome,
  });
  const cliente = await deps.resolverCliente(venda.clienteCodigo);

  // Reverificação **depois** da rede, colada nas mutações.
  //
  // Entre a pré-condição acima e este ponto há dois `await`, e a venda continua
  // viva atrás da janela de importação. Sem esta segunda leitura, um estado que
  // virasse nesse intervalo — o caso real é a feature 008 aprovando um TEF de
  // forma assíncrona — deixaria cada mutação abaixo virar um no-op na guarda do
  // seu próprio slice, enquanto o evento seria registrado e a janela fecharia
  // como sucesso: trilha de auditoria afirmando uma importação que não
  // aconteceu, com o carrinho vazio (AD-139). Recusar aqui devolve o erro à UI
  // e mantém a promessa de atomicidade do parágrafo acima.
  const recusaPosRede = recusaDeImportacao(deps.estadoDaVenda());
  if (recusaPosRede !== null) {
    throw new ErroImportacaoRecusada(recusaPosRede);
  }

  // Primeiro a identidade: a venda passa a ser a NFCe rascunho do documento, e
  // só então é populada. Trocar a ordem não muda o resultado, mas esta lê como
  // o que de fato acontece.
  deps.definirIdentidadeVenda({ origem: fonte.origem, numeroNota: venda.numeroNota });
  deps.importarLinhasCongeladas(venda.linhas, fonte.origem);
  await deps.selecionarCliente(cliente);
  deps.trocarVendedor({ codigo: venda.vendedorCodigo, nome: venda.vendedorNome });
  deps.importarFormasDePagamento(venda.formasDePagamento);

  // Um evento por importação, depois que tudo já foi populado (AD-114).
  deps.registrarEventoAuditoria(fonte.eventoDeImportacao(venda));

  // Sem `await`: a importação está completa e o operador já pode operar o
  // carrinho. A descrição é enfeite que chega depois (AD-096) — segurá-la aqui
  // deixaria a janela de importação aberta esperando uma chamada que, por
  // definição, tem permissão para falhar.
  void resolverDescricoes(venda, deps);
}
