/**
 * Camada de rede da recuperação de rascunho de NFCe (T008/T021).
 *
 * Todas as chamadas passam pelo proxy autenticado `/api/erp/*` da feature 002 —
 * o frontend nunca fala com o ERP direto, e `Empresa`/`Authorization` são
 * injetados no servidor.
 *
 * Este módulo é o **par** de `services/dav/davQueries.ts`: cada um conhece os
 * seus dois endpoints e constrói a sua `FonteDocumento`; a orquestração que
 * popula a venda é uma só, em `services/importacao/importarVendaExistente.ts`
 * (AD-166). Nada aqui muta estado — como lá, o módulo não importa `vendaStore`.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CheckoutFaturarNFCe } from '../../../shared/schemas/dav.schema';
import {
  carregarNFCeOutputSchema,
  listaNFCesOutputSchema,
} from '../../../shared/schemas/recuperacaoNFCe.schema';
import { eventoNFCeRecuperada } from '../../domain/auditoria/eventos';
import type { Centavos } from '../../domain/precificacao/dinheiro';
import { criarErpClient, type ErpClient } from '../erpClient';
import { ErroRedeErp, ErroRespostaInvalida, ErroSessaoEncerrada } from '../errosErp';
import type { FonteDocumento } from '../importacao/importarVendaExistente';

const CAMINHO_LISTA_NFCES = '/ApiCentriumOAuth/GetListaNFCes';
const CAMINHO_CARREGAR_NFCE = '/ApiCentriumOAuth/CarregarNFCe';

const PAGINA_INICIAL = 1;
const TAMANHO_PAGINA_PADRAO = 20;

/**
 * Teto absoluto de `Tamanhopagina` (AD-024, `research.md` D2).
 *
 * Mesmo bug de paginação do `ListaDAVs`: o cap de 50 do servidor é **anulado**
 * quando o parâmetro chega preenchido, e ele é obrigatório para paginar. O
 * limite passa a ser responsabilidade do Checkout — sem este `Math.min`, um
 * valor alto chegaria ao ERP sem contenção nenhuma.
 */
const LIMITE_TAMANHO_PAGINA = 50;

export interface RecuperacaoQueriesDeps {
  readonly erpClient?: ErpClient;
}

/**
 * Item da listagem de rascunhos (`data-model.md` §1).
 *
 * Ao contrário de `DavListado`, traz `vendedor` e `operador` por **nome**: o
 * contrato de `GetListaNFCes` devolve os dois como texto, e não só o código
 * (a limitação de AD-095 é de `ListaDAVs`, não deste endpoint).
 *
 * Não há série, caixa/terminal nem status: o contrato não os tem. `emissao`
 * fica como o ERP mandou, em ISO 8601, e é formatada só na exibição.
 */
export interface RascunhoListado {
  readonly numeroNota: number;
  readonly cliente: string;
  readonly vendedor: string;
  readonly operador: string;
  /** ISO 8601 (`date-time`), cru como veio — nunca reinterpretado. */
  readonly emissao: string;
  readonly total: Centavos;
}

export interface PaginaDeRascunhos {
  readonly paginaAtual: number;
  readonly totalPaginas: number;
  readonly totalRegistros: number;
  readonly rascunhos: readonly RascunhoListado[];
}

export interface FiltrosRascunho {
  readonly txtBusca?: string;
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
 * Só os filtros preenchidos entram na query — um `Txtbusca=` vazio não é
 * "sem filtro" para o ERP.
 *
 * **Não há filtro de data aqui**, ao contrário de `ListaDAVs`: a janela de
 * tempo dos rascunhos é fixada no servidor e não é parametrizável
 * (`research.md` D1). Pelo mesmo motivo não há busca por número da nota — o
 * `DataProvider` do ERP filtra só nome de cliente e de vendedor.
 */
function parametrosDaLista(filtros: FiltrosRascunho): URLSearchParams {
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

  return parametros;
}

export async function fetchListaNFCes(
  filtros: FiltrosRascunho,
  deps: RecuperacaoQueriesDeps = {},
): Promise<PaginaDeRascunhos> {
  const cliente = deps.erpClient ?? criarErpClient();
  const resposta = await chamarErp(
    cliente,
    `${CAMINHO_LISTA_NFCES}?${parametrosDaLista(filtros).toString()}`,
  );

  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  const validado = listaNFCesOutputSchema.safeParse(await resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('GetListaNFCes', validado.error.message);
  }

  const lista = validado.data;
  return {
    paginaAtual: lista.PaginaAtual,
    totalPaginas: lista.TotalPaginas,
    totalRegistros: lista.TotalRegistros,
    rascunhos: lista.Rascunho.map((item) => ({
      numeroNota: item.NumeroNota,
      cliente: item.Cliente,
      vendedor: item.Vendedor,
      operador: item.Operador,
      emissao: item.Emissao,
      total: item.Total,
    })),
  };
}

/**
 * Listagem paginada para a janela de recuperação (`NFCE-01`).
 *
 * `staleTime: 0`, como a de DAV: a lista reflete rascunhos de **outros**
 * operadores, e um que fosse faturado enquanto a janela está aberta precisa
 * sumir na próxima consulta.
 *
 * `habilitado` desliga a query com a janela fechada — sem isso a listagem seria
 * buscada no carregamento da tela de venda, antes de qualquer intenção do
 * operador.
 */
export function useListaNFCes(
  filtros: FiltrosRascunho,
  habilitado: boolean,
  deps: RecuperacaoQueriesDeps = {},
): UseQueryResult<PaginaDeRascunhos, Error> {
  return useQuery({
    queryKey: [
      'lista-nfces',
      filtros.txtBusca?.trim() ?? '',
      filtros.pagina ?? PAGINA_INICIAL,
    ] as const,
    queryFn: () => fetchListaNFCes(filtros, deps),
    enabled: habilitado,
    staleTime: 0,
  });
}

/**
 * Documento completo de um rascunho — mesmo shape de `GetDav` (AD-057).
 *
 * @param serie `SessaoUsuario.CadSerieNFCe`, **sempre** do bootstrap e nunca um
 * valor vindo da listagem (`research.md` D4). Chega como parâmetro, e não lido
 * do `sessionStore` aqui, para o serviço não conhecer Zustand — quem resolve é
 * o hook da feature.
 */
export async function fetchCarregarNFCe(
  numeroNota: number,
  serie: string,
  deps: RecuperacaoQueriesDeps = {},
): Promise<CheckoutFaturarNFCe> {
  const cliente = deps.erpClient ?? criarErpClient();
  const query = new URLSearchParams({
    Numeronota: String(numeroNota),
    Serienota: serie,
  });
  const resposta = await chamarErp(cliente, `${CAMINHO_CARREGAR_NFCE}?${query.toString()}`);

  // Cobre o `404` do contrato: o rascunho já foi faturado por outro operador
  // entre a listagem e a seleção, ou saiu da janela de tempo do servidor. É
  // erro de negócio — vira mensagem ao operador, sem retry automático — e nunca
  // uma lista vazia silenciosa.
  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  const validado = carregarNFCeOutputSchema.safeParse(await resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('CarregarNFCe', validado.error.message);
  }

  return validado.data;
}

/**
 * O rascunho de NFCe como fonte da orquestração compartilhada
 * (`services/importacao/importarVendaExistente.ts`).
 *
 * Espelho de `fonteDav`: é **tudo** o que a recuperação tem de particular —
 * endpoint, rótulo de origem e evento de auditoria. Pré-condição, ordem dos
 * efeitos e atomicidade são o comportamento comum às duas features.
 *
 * @param rascunho Linha selecionada na listagem mais a série da sessão.
 * `cliente` é o nome capturado da lista; o `clienteCodigo` vem sempre da
 * resposta de `CarregarNFCe`, nunca da listagem.
 */
export function fonteRascunho(rascunho: {
  readonly numeroNota: number;
  readonly cliente: string;
  readonly serie: string;
}): FonteDocumento {
  return {
    origem: 'RASCUNHO',
    clienteNome: rascunho.cliente,
    carregar: (erpClient) =>
      fetchCarregarNFCe(
        rascunho.numeroNota,
        rascunho.serie,
        erpClient === undefined ? {} : { erpClient },
      ),
    // `serie` acompanha o evento porque `CarregarNFCe` só resolve o par
    // número+série: sozinho, o número não identifica o documento retomado.
    eventoDeImportacao: (venda) =>
      eventoNFCeRecuperada({
        numeroNota: venda.numeroNota,
        serie: rascunho.serie,
        quantidadeLinhas: venda.linhas.length,
        quantidadeFormasDePagamento: venda.formasDePagamento.length,
      }),
  };
}
