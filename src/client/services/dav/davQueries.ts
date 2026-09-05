/**
 * Camada de rede da importação de DAV (T007, T011–T017).
 *
 * Todas as chamadas passam pelo proxy autenticado `/api/erp/*` da feature 002 —
 * o frontend nunca fala com o ERP direto, e `Empresa`/`Authorization` são
 * injetados no servidor.
 *
 * A **orquestração** que popula a venda (carrinho, cliente, vendedor, pagamento
 * e auditoria) nasceu aqui e mudou para
 * `services/importacao/importarVendaExistente.ts` quando a feature 011 chegou
 * (AD-166): ela é idêntica para DAV e para rascunho de NFCe, e a única
 * diferença — qual endpoint devolve o documento — está isolada em
 * `fonteDav`, logo abaixo. O que sobra neste módulo é só o que é de fato
 * específico do DAV.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  getDavOutputSchema,
  listaDavsOutputSchema,
  type CheckoutFaturarNFCe,
} from '../../../shared/schemas/dav.schema';
import { eventoDavImportado } from '../../domain/auditoria/eventos';
import type { Centavos } from '../../domain/precificacao/dinheiro';
import { criarErpClient, type ErpClient } from '../erpClient';
import { ErroRedeErp, ErroRespostaInvalida, ErroSessaoEncerrada } from '../errosErp';
import type { FonteDocumento } from '../importacao/importarVendaExistente';

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

  // `validado.data` já é a lista: o schema aceita a resposta com ou sem o
  // envelope `CheckoutListaDAVs` e entrega sempre o conteúdo (AD-165).
  const lista = validado.data;
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
 * O DAV como fonte da orquestração compartilhada
 * (`services/importacao/importarVendaExistente.ts`).
 *
 * Este objeto é **tudo** o que a importação de DAV tem de particular: o
 * endpoint que devolve o documento, o rótulo de origem e o evento de auditoria.
 * Todo o resto — pré-condição, ordem dos efeitos, atomicidade, resolução de
 * descrição — é o comportamento comum, que a 011 executa idêntico.
 *
 * @param dav Linha selecionada na listagem. `clienteNome` é o único campo lido
 * dela — `clienteCodigo` vem sempre da resposta de `GetDav`, nunca da lista.
 */
export function fonteDav(dav: {
  readonly numeroDav: string;
  readonly clienteNome: string;
}): FonteDocumento {
  return {
    origem: 'DAV',
    clienteNome: dav.clienteNome,
    // `ListaDAVs` devolve só `VendedorCodigo` (AD-095) — não há nome a
    // capturar aqui, ao contrário de `GetListaNFCes`, que traz o do vendedor
    // por extenso.
    vendedorNome: null,
    carregar: (erpClient) => fetchDav(dav.numeroDav, erpClient === undefined ? {} : { erpClient }),
    // `numeroDav` existe só nesta trilha local: não é reenviado a `FaturarNFCe`
    // (AD-107), onde o vínculo com a origem é o `NumeroNota`.
    eventoDeImportacao: (venda) =>
      eventoDavImportado({
        numeroDav: dav.numeroDav,
        numeroNota: venda.numeroNota,
        quantidadeLinhas: venda.linhas.length,
        quantidadeFormasDePagamento: venda.formasDePagamento.length,
      }),
  };
}
