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
import { recusaDeNegocio } from '../../../shared/schemas/erpJson';
import {
  carregarNFCeOutputSchema,
  listaNFCesOutputSchema,
} from '../../../shared/schemas/recuperacaoNFCe.schema';
import { eventoNFCeRecuperada } from '../../domain/auditoria/eventos';
import type { Centavos } from '../../domain/precificacao/dinheiro';
import { criarErpClient, type ErpClient } from '../erpClient';
import {
  ErroNegocioErp,
  ErroRedeErp,
  ErroRespostaInvalida,
  ErroSessaoEncerrada,
} from '../errosErp';
import type { FonteDocumento } from '../importacao/importarVendaExistente';
import { ITENS_POR_PAGINA } from '../paginacao';

const CAMINHO_LISTA_NFCES = '/ApiCentriumOAuth/GetListaNFCes';
const CAMINHO_CARREGAR_NFCE = '/ApiCentriumOAuth/CarregarNFCe';

const PAGINA_INICIAL = 1;

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
 * Item da listagem de rascunhos (`data-model.md` §1), na forma do contrato de
 * 2026-09-14 (AD-235): código e nome separados, e a série do rascunho.
 *
 * Nomes chegam como o ERP mandou, `''` inclusive (operador sem nome): quem
 * exibe decide o texto do vazio. Não há caixa/terminal nem status: o contrato
 * não os tem. `emissao` fica como o ERP mandou, em ISO 8601, e é formatada só
 * na exibição.
 */
export interface RascunhoListado {
  /** Enviado a `CarregarNFCe` como `Numeronota` (o parâmetro manteve o nome). */
  readonly numeroRascunho: number;
  /** Enviada a `CarregarNFCe` como `Serienota`. */
  readonly serie: string;
  readonly clienteCodigo: number;
  readonly clienteNome: string;
  readonly vendedorCodigo: number;
  readonly vendedorNome: string;
  readonly operadorNome: string;
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
 * Não há busca por número da nota: o `DataProvider` do ERP filtra só nome de
 * cliente e de vendedor. (O filtro de data, que o ERP de 2026-09-14 passou a
 * aceitar, é da frente C do plano de AD-235 — ainda não enviado aqui.)
 */
function parametrosDaLista(filtros: FiltrosRascunho): URLSearchParams {
  const parametros = new URLSearchParams({
    Pagina: String(filtros.pagina ?? PAGINA_INICIAL),
    Tamanhopagina: String(
      Math.min(filtros.tamanhoPagina ?? ITENS_POR_PAGINA, LIMITE_TAMANHO_PAGINA),
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
      numeroRascunho: item.NumeroRascunho,
      serie: item.Serie,
      clienteCodigo: item.ClienteCodigo,
      clienteNome: item.ClienteNome,
      vendedorCodigo: item.VendedorCodigo,
      vendedorNome: item.VendedorNome,
      operadorNome: item.OperadorNome,
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
    // `tamanhoPagina` entra na chave junto com busca e página: ele é público em
    // `FiltrosRascunho` e altera o corpo da resposta, então omiti-lo faria duas
    // consultas de tamanhos diferentes compartilharem a mesma entrada de cache
    // — a segunda receberia a página da primeira sem nem chamar o ERP.
    queryKey: [
      'lista-nfces',
      filtros.txtBusca?.trim() ?? '',
      filtros.pagina ?? PAGINA_INICIAL,
      Math.min(filtros.tamanhoPagina ?? ITENS_POR_PAGINA, LIMITE_TAMANHO_PAGINA),
    ] as const,
    queryFn: () => fetchListaNFCes(filtros, deps),
    enabled: habilitado,
    staleTime: 0,
  });
}

/**
 * Documento completo de um rascunho — mesmo shape de `GetDav` (AD-057).
 *
 * @param numeroRascunho `Rascunho[].NumeroRascunho` da listagem. O parâmetro da
 * API continua se chamando `Numeronota` no contrato de 2026-09-14; só o valor
 * mudou de nome.
 * @param serie `Rascunho[].Serie` da listagem (AD-235), e não mais
 * `SessaoUsuario.CadSerieNFCe` como `research.md` D4 decidia — o contrato novo
 * devolve a série por rascunho, e no preview a da sessão vem vazia. Chega como
 * parâmetro para o serviço não conhecer Zustand.
 */
export async function fetchCarregarNFCe(
  numeroRascunho: number,
  serie: string,
  deps: RecuperacaoQueriesDeps = {},
): Promise<CheckoutFaturarNFCe> {
  const cliente = deps.erpClient ?? criarErpClient();
  const query = new URLSearchParams({
    Numeronota: String(numeroRascunho),
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

  const corpo: unknown = await resposta.json();

  // Recusa de negócio lida antes da validação, e da raiz — mesmo tratamento de
  // `fetchDav`. É o caminho de "Série é obrigatório", que o ERP responde quando
  // a série chega vazia: o operador precisa ler isso, não "formato inesperado"
  // (2026-09-11).
  const recusa = recusaDeNegocio(corpo);
  if (recusa !== null) {
    throw new ErroNegocioErp('CarregarNFCe', recusa);
  }

  const validado = carregarNFCeOutputSchema.safeParse(corpo);
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
 * @param rascunho Linha selecionada na listagem (número, série e vendedor). O
 * `clienteCodigo` vem sempre da resposta de `CarregarNFCe`, nunca da
 * listagem, e o cliente é resolvido por `resolverCliente` (AD-115), não
 * capturado aqui. O vendedor da linha vira *fallback* de `mapearVendaExistente`:
 * o nome atrás do documento (AD-172) e o código quando `CarregarNFCe` devolve
 * `vendedorCodigo` 0 (divergência do ERP de 2026-09-14, AD-235).
 */
export function fonteRascunho(
  rascunho: Pick<RascunhoListado, 'numeroRascunho' | 'serie' | 'vendedorCodigo' | 'vendedorNome'>,
): FonteDocumento {
  return {
    origem: 'RASCUNHO',
    // Nome em branco é "não informado", não string vazia, e código 0 é "sem
    // vendedor" — nenhum dos dois serve de fallback.
    vendedorDaLista: {
      codigo: rascunho.vendedorCodigo === 0 ? null : rascunho.vendedorCodigo,
      nome: rascunho.vendedorNome === '' ? null : rascunho.vendedorNome,
    },
    carregar: (erpClient) =>
      fetchCarregarNFCe(
        rascunho.numeroRascunho,
        rascunho.serie,
        erpClient === undefined ? {} : { erpClient },
      ),
    // `serie` acompanha o evento porque `CarregarNFCe` só resolve o par
    // número+série: sozinho, o número não identifica o documento retomado.
    eventoDeImportacao: (venda) =>
      eventoNFCeRecuperada({
        numeroRascunho: venda.numeroRascunho,
        serie: rascunho.serie,
        quantidadeLinhas: venda.linhas.length,
        quantidadeFormasDePagamento: venda.formasDePagamento.length,
      }),
  };
}
