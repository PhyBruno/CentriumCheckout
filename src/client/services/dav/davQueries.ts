/**
 * Camada de rede e orquestração da importação de DAV (T007, T011–T017).
 *
 * Todas as chamadas passam pelo proxy autenticado `/api/erp/*` da feature 002 —
 * o frontend nunca fala com o ERP direto, e `Empresa`/`Authorization` são
 * injetados no servidor.
 *
 * `importarVendaExistente` é a **orquestração** da feature: é ela que conecta
 * carrinho (003), cliente (005), vendedor (012), pagamento (008) e auditoria
 * (001). Mora aqui, na camada de serviço, e não num slice novo, porque nenhum
 * slice conhece os outros — é essa fronteira que a Dependency Inversion da
 * Constitution II protege, e que a feature 005 já estabeleceu (`carrinhoSlice`
 * nunca importa `clienteSlice`). Por isso o módulo também não importa
 * `vendaStore`: tudo o que ele muta chega por `ImportacaoVendaDeps`, e quem
 * liga as pontas é o hook de `features/dav/`.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  getDavOutputSchema,
  listaDavsOutputSchema,
  type CheckoutFaturarNFCe,
} from '../../../shared/schemas/dav.schema';
import type { ClienteCheckout } from '../../../shared/schemas/cliente.schema';
import type { EventoAuditoriaRegistravel } from '../../domain/auditoria/eventos';
import { eventoDavImportado } from '../../domain/auditoria/eventos';
import {
  mapearVendaExistente,
  type FormaPagamentoImportada,
  type LinhaImportada,
  type VendaImportada,
} from '../../domain/importacaoVenda/mapearVendaExistente';
import type { Centavos } from '../../domain/precificacao/dinheiro';
import { criarErpClient, type ErpClient } from '../erpClient';
import { ErroRedeErp, ErroRespostaInvalida, ErroSessaoEncerrada } from '../errosErp';

const CAMINHO_LISTA_DAVS = '/ApiCentriumOAuth/ListaDAVs';
const CAMINHO_GET_DAV = '/ApiCentriumOAuth/GetDav';

const PAGINA_INICIAL = 1;
const TAMANHO_PAGINA_PADRAO = 20;

/**
 * Teto absoluto de `Tamanhopagina` (AD-024).
 *
 * O servidor tem um cap de 50 que é **anulado** quando o parâmetro chega
 * preenchido — um bug conhecido de paginação. Como o parâmetro é obrigatório
 * para paginar, o limite passa a ser responsabilidade do Checkout: sem este
 * `Math.min`, um valor alto chegaria ao ERP sem nenhuma contenção.
 */
const LIMITE_TAMANHO_PAGINA = 50;

export interface DavQueriesDeps {
  readonly erpClient?: ErpClient;
}

/**
 * Item da listagem (`data-model.md` §1).
 *
 * `Senha` existe no contrato e não é modelado — nenhum requisito o consome.
 * `valorTotal` fica em **centavos**, não no `double` que o data-model
 * rascunhou: valor monetário não circula como decimal dentro da aplicação
 * (Constitution V), e é a conversão de fronteira do schema que garante isso
 * mesmo num campo que só serve para exibição.
 */
export interface DavListado {
  readonly numeroDav: string;
  readonly titulo: string;
  /** `YYYY-MM-DD`, como o ERP devolve. */
  readonly dataEmissao: string;
  readonly clienteCodigo: number;
  readonly clienteNome: string;
  /** Sem nome correspondente no contrato (AD-095) — a UI exibe só o código. */
  readonly vendedorCodigo: number;
  readonly valorTotal: Centavos;
}

export interface PaginaDeDavs {
  readonly paginaAtual: number;
  readonly totalPaginas: number;
  readonly totalRegistros: number;
  readonly davs: readonly DavListado[];
}

export interface FiltrosDav {
  readonly txtBusca?: string;
  /** `YYYY-MM-DD`; ausente = sem piso de data. */
  readonly dataInicial?: string;
  /** `YYYY-MM-DD`; ausente = sem teto de data. */
  readonly dataFinal?: string;
  readonly pagina?: number;
  readonly tamanhoPagina?: number;
}

async function chamarErp(cliente: ErpClient, url: string): Promise<Response> {
  const resultado = await cliente.chamar(url, { method: 'GET' });

  switch (resultado.estado) {
    case 'erro-de-rede':
      throw new ErroRedeErp();
    case 'sessao-encerrada':
      throw new ErroSessaoEncerrada();
    case 'ok':
      return resultado.resposta;
  }
}

/**
 * Só os filtros preenchidos entram na query.
 *
 * Um `Datainicial=` vazio não é "sem filtro" para o ERP — é uma data inválida.
 * Omitir é o que o contrato define como ausência de piso/teto.
 */
function parametrosDaLista(filtros: FiltrosDav): URLSearchParams {
  const parametros = new URLSearchParams({
    Pagina: String(filtros.pagina ?? PAGINA_INICIAL),
    Tamanhopagina: String(
      Math.min(filtros.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO, LIMITE_TAMANHO_PAGINA),
    ),
  });

  const busca = filtros.txtBusca?.trim() ?? '';
  if (busca !== '') {
    parametros.set('Txtbusca', busca);
  }
  if (filtros.dataInicial !== undefined && filtros.dataInicial !== '') {
    parametros.set('Datainicial', filtros.dataInicial);
  }
  if (filtros.dataFinal !== undefined && filtros.dataFinal !== '') {
    parametros.set('Datafinal', filtros.dataFinal);
  }

  return parametros;
}

export async function fetchListaDavs(
  filtros: FiltrosDav,
  deps: DavQueriesDeps = {},
): Promise<PaginaDeDavs> {
  const cliente = deps.erpClient ?? criarErpClient();
  const resposta = await chamarErp(
    cliente,
    `${CAMINHO_LISTA_DAVS}?${parametrosDaLista(filtros).toString()}`,
  );

  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  const validado = listaDavsOutputSchema.safeParse(await resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('ListaDAVs', validado.error.message);
  }

  const lista = validado.data.CheckoutListaDAVs;
  return {
    paginaAtual: lista.PaginaAtual,
    totalPaginas: lista.TotalPaginas,
    totalRegistros: lista.TotalRegistros,
    davs: lista.DAV.map((item) => ({
      numeroDav: item.NumeroDAV,
      titulo: item.Titulo,
      dataEmissao: item.DataEmissao,
      clienteCodigo: item.ClienteCodigo,
      clienteNome: item.ClienteNome,
      vendedorCodigo: item.VendedorCodigo,
      valorTotal: item.ValorTotal,
    })),
  };
}

/**
 * Listagem paginada para a janela de importação (`DAV-01`).
 *
 * `staleTime: 0`, ao contrário do produto (`Infinity`): a lista não alimenta
 * cálculo nenhum, é lista de escolha, e um DAV faturado por outro operador
 * enquanto a janela está aberta precisa sumir na próxima consulta.
 *
 * `habilitado` desliga a query quando a janela está fechada. Sem isso a
 * listagem seria buscada no carregamento da tela de venda, antes de qualquer
 * intenção do operador.
 */
export function useListaDavs(
  filtros: FiltrosDav,
  habilitado: boolean,
  deps: DavQueriesDeps = {},
): UseQueryResult<PaginaDeDavs, Error> {
  return useQuery({
    queryKey: [
      'lista-davs',
      filtros.txtBusca?.trim() ?? '',
      filtros.dataInicial ?? '',
      filtros.dataFinal ?? '',
      filtros.pagina ?? PAGINA_INICIAL,
    ] as const,
    queryFn: () => fetchListaDavs(filtros, deps),
    enabled: habilitado,
    staleTime: 0,
  });
}

/** Documento completo de um DAV — mesmo shape de `CarregarNFCe` (AD-057). */
export async function fetchDav(
  numeroDav: string,
  deps: DavQueriesDeps = {},
): Promise<CheckoutFaturarNFCe> {
  const cliente = deps.erpClient ?? criarErpClient();
  const query = new URLSearchParams({ Numerodav: numeroDav });
  const resposta = await chamarErp(cliente, `${CAMINHO_GET_DAV}?${query.toString()}`);

  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  const validado = getDavOutputSchema.safeParse(await resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('GetDav', validado.error.message);
  }

  return validado.data.OutCheckoutFaturarNFCe;
}

/**
 * Portas da orquestração (Dependency Inversion — `contracts/importacao-domain-api.md` §3).
 *
 * Todas chegam de fora, inclusive as das features **ainda não implementadas**:
 * `trocarVendedor` (012) e `importarFormasDePagamento` (008) entram como stub
 * `() => {}` até que essas features forneçam a implementação real. É o mesmo
 * padrão que a feature 004 já usa para as suas dependências futuras — a 006 não
 * fica bloqueada, e ligar as reais depois é trocar o objeto injetado, sem tocar
 * neste módulo.
 */
export interface ImportacaoVendaDeps {
  /**
   * Feature 004 — grava `{ origem: 'DAV', numeroNota }` na identidade da venda.
   *
   * **É o elo que faz o DAV fechar no ERP.** `montarRetratoVenda` monta o
   * payload de `FaturarNFCe` lendo `NumeroNota` de `identidadeVenda`
   * (`montarRetratoVenda.ts`), e desde a remoção de `DavNum` esse número é o
   * único vínculo com o documento de origem (AD-107). Sem esta chamada a venda
   * importada seria faturada como venda nova, com `NumeroNota: 0`, e o DAV
   * ficaria aberto no ERP — sem erro, sem aviso.
   *
   * Não é `abrirSessaoDeVenda` de propósito: aquela função **zera** o histórico
   * de auditoria, e importar um DAV no meio de uma venda apagaria o registro do
   * que o operador já tinha feito. A trilha correta é o histórico existente
   * seguido de `DAV_IMPORTADO`.
   */
  definirIdentidadeVenda(identidade: { readonly origem: 'DAV'; readonly numeroNota: number }): void;
  /** Feature 003 — extensão aditiva do `CarrinhoSlice`. */
  importarLinhasCongeladas(linhas: readonly LinhaImportada[]): void;
  /** Feature 003 — metadado de exibição, resolvido em segundo plano. */
  editarSnapshotDescricao(codigoProduto: string, descricao: string): void;
  /** Feature 005 — `GetCliente` por `CodCliente` (AD-115). */
  resolverCliente(codigo: number): Promise<ClienteCheckout>;
  /** Feature 005 — `selecionarCliente(cliente, 'DAV')`, já ligada à origem. */
  selecionarCliente(cliente: ClienteCheckout): Promise<unknown>;
  /** Feature 012 — stub até a seleção de vendedor existir. */
  trocarVendedor(vendedor: { readonly codigo: number; readonly nome: string | null }): void;
  /** Feature 008 — stub até o estado de pagamento existir. */
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
async function resolverDescricoes(
  venda: VendaImportada,
  deps: ImportacaoVendaDeps,
): Promise<void> {
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
 * Importa um documento existente para a venda em andamento (`DAV-02`).
 *
 * **Toda a rede acontece antes de qualquer mutação** — `GetDav` e o
 * `GetCliente` que resolve o cliente do documento. É o que satisfaz D7/`FR-010`
 * ao pé da letra: uma falha em qualquer um dos dois deixa o carrinho
 * exatamente como estava, sem meio-documento importado. (O contrato numera o
 * carrinho antes do cliente; a ordem foi invertida de propósito, porque a
 * numeração descreve o resultado, não a janela de falha.)
 *
 * Uma falha ao resolver o cliente aborta a importação inteira em vez de seguir
 * com o cliente anterior: `FR-007` exige que o cliente do documento substitua o
 * que estiver na venda, e importar itens sob o cliente errado produziria uma
 * NFCe com preço e destinatário divergentes do documento de origem.
 *
 * @param origemLista Linha da listagem selecionada. Carrega só `clienteNome`, o
 * único campo que `mapearVendaExistente` lê dela — `clienteCodigo` vem sempre
 * da resposta de `GetDav`, nunca da lista.
 */
export async function importarVendaExistente(
  numeroDav: string,
  origemLista: { readonly clienteNome: string },
  deps: ImportacaoVendaDeps,
): Promise<void> {
  const documento = await fetchDav(
    numeroDav,
    deps.erpClient === undefined ? {} : { erpClient: deps.erpClient },
  );
  const venda = mapearVendaExistente(documento, origemLista);
  const cliente = await deps.resolverCliente(venda.clienteCodigo);

  // Primeiro a identidade: a venda passa a ser a NFCe rascunho do documento, e
  // só então é populada. Trocar a ordem não muda o resultado, mas esta lê como
  // o que de fato acontece.
  deps.definirIdentidadeVenda({ origem: 'DAV', numeroNota: venda.numeroNota });
  deps.importarLinhasCongeladas(venda.linhas);
  await deps.selecionarCliente(cliente);
  deps.trocarVendedor({ codigo: venda.vendedorCodigo, nome: venda.vendedorNome });
  deps.importarFormasDePagamento(venda.formasDePagamento);

  // Um evento por importação, depois que tudo já foi populado (AD-114).
  // `numeroDav` existe só nesta trilha local: não é reenviado a `FaturarNFCe`
  // (AD-107).
  deps.registrarEventoAuditoria(
    eventoDavImportado({
      numeroDav,
      numeroNota: venda.numeroNota,
      quantidadeLinhas: venda.linhas.length,
      quantidadeFormasDePagamento: venda.formasDePagamento.length,
    }),
  );

  // Sem `await`: a importação está completa e o operador já pode operar o
  // carrinho. A descrição é enfeite que chega depois (AD-096) — segurá-la aqui
  // deixaria a janela de importação aberta esperando uma chamada que, por
  // definição, tem permissão para falhar.
  void resolverDescricoes(venda, deps);
}
