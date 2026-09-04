/**
 * Camada de rede do catálogo de pagamento e da validação de vale devolução
 * (T009).
 *
 * `useCondicoesPagamento` lê `GET /api/bootstrap` — **não** existe endpoint
 * dedicado de formas/condições de pagamento (`research.md` D1 → AD-097). É uma
 * segunda leitura da mesma rota que `bootstrapClient.ts` já usa para montar o
 * `SessionState` (Zustand + Dexie), e não um caminho de fetch inventado: D1
 * rejeita explicitamente ler do Dexie aqui, porque o Dexie não tem invalidação
 * por tempo e `PAY-01` exige frescor de 30 minutos — semântica de cache de
 * servidor, que é exatamente o que o TanStack Query dá. As duas leituras
 * convivem por terem propósitos diferentes: o bootstrap do Zustand/Dexie
 * decide se a tela de venda libera (F5, sessão), esta query decide se o
 * catálogo de pagamento está fresco o bastante para a venda em andamento.
 *
 * `validarTicket` chama `POST /api/erp/ValidaTicketDevolucao` pelo proxy
 * autenticado da feature 002 — mesmo padrão de `produtoQueries.ts`.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CondicaoPagamento } from '../../domain/pagamento/formaPagamento';
import type { CapacidadesPagamento } from '../../domain/pagamento/roteamentoIntegracao';
import {
  interpretarRespostaTicket,
  type ResultadoTicket,
} from '../../domain/pagamento/valeDevolucao';
import {
  bootstrapPagamentoSchema,
  validaTicketDevolucaoOutputSchema,
} from '../../../shared/schemas/pagamento.schema';
import type { Centavos } from '../../domain/precificacao/dinheiro';
import { criarErpClient, type ErpClient } from '../erpClient';
import { ErroRedeErp, ErroRespostaInvalida, ErroSessaoEncerrada } from '../errosErp';
import { paraCapacidadesPagamento, paraCondicoesPagamento, paraMinimoPix } from './pagamentoMapper';

const ROTA_BOOTSTRAP = '/api/bootstrap';
const CAMINHO_VALIDA_TICKET = '/ApiCentriumOAuth/ValidaTicketDevolucao';

/** `PAY-01`: frescor do catálogo de pagamento. */
const TRINTA_MINUTOS_EM_MS = 30 * 60 * 1000;

export const CHAVE_CONDICOES_PAGAMENTO = ['pagamento', 'condicoes'] as const;

export interface PagamentoQueriesDeps {
  readonly erpClient?: ErpClient;
  readonly fetchImpl?: typeof fetch;
}

export interface CatalogoPagamento {
  readonly condicoes: readonly CondicaoPagamento[];
  readonly capacidades: CapacidadesPagamento;
  /**
   * `ConfiguracoesPIX.MinimoPix` (feature 009, `research.md` D13/AD-047).
   *
   * Viaja **junto do catálogo**, e não numa query própria: é o mesmo payload de
   * `/api/bootstrap` que já é lido aqui, e o modal de PIX só é alcançável depois
   * de uma forma deste catálogo ter sido aplicada — buscá-lo de novo seria uma
   * segunda leitura da mesma rota com outro ciclo de frescor.
   */
  readonly minimoPix: Centavos;
}

/**
 * `/api/bootstrap` não é um endpoint do ERP proxiado por `/api/erp/*` — é a
 * própria rota de agregação do BFF (feature 002), por isso a chamada usa
 * `fetch` direto, igual a `bootstrapClient.ts`, em vez de `criarErpClient`
 * (que sempre prefixa `/api/erp`). O 401 é tratado manualmente pelo mesmo
 * motivo: `ErpClient.chamar` não cobre esta rota.
 *
 * Exportada (não só usada dentro do hook) pelo mesmo motivo de `fetchProduto`
 * em `produtoQueries.ts`: o teste chama a função direto, sem montar um
 * componente React em volta de `useQuery`.
 */
export async function fetchCondicoesPagamento(
  deps: PagamentoQueriesDeps = {},
): Promise<CatalogoPagamento> {
  const executarFetch = deps.fetchImpl ?? fetch;

  let resposta: Response;
  try {
    resposta = await executarFetch(ROTA_BOOTSTRAP, { credentials: 'same-origin' });
  } catch {
    throw new ErroRedeErp();
  }

  if (resposta.status === 401) {
    throw new ErroSessaoEncerrada();
  }
  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  const validado = bootstrapPagamentoSchema.safeParse(await resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('bootstrap (pagamento)', validado.error.message);
  }

  return {
    condicoes: paraCondicoesPagamento(validado.data.SessaoUsuario.CondicoesDePagamento),
    capacidades: paraCapacidadesPagamento(validado.data.SessaoUsuario),
    minimoPix: paraMinimoPix(validado.data.SessaoUsuario),
  };
}

/**
 * Catálogo de condições/formas de pagamento + capacidades de integração, com
 * `staleTime: 30min` (`PAY-01`). É a única query desta feature — todo o resto
 * do catálogo (disponibilidade por forma, roteamento) é derivado dela por
 * seletor puro no domínio, não por outra chamada de rede.
 */
export function useCondicoesPagamento(
  deps: PagamentoQueriesDeps = {},
): UseQueryResult<CatalogoPagamento, Error> {
  return useQuery({
    queryKey: CHAVE_CONDICOES_PAGAMENTO,
    queryFn: () => fetchCondicoesPagamento(deps),
    staleTime: TRINTA_MINUTOS_EM_MS,
  });
}

async function chamarErp(
  cliente: ErpClient,
  caminho: string,
  init: RequestInit,
): Promise<Response> {
  const resultado = await cliente.chamar(caminho, init);

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
 * Valida um vale devolução (`FR-009`). Chamada imperativa, **sem** `useQuery`
 * — é uma ação disparada uma única vez por vale no momento da aplicação, não
 * um dado que faça sentido cachear ou refazer em background (`PAY-06`).
 *
 * O corpo enviado é **só** `{ ticketDevolucao: codigo }` — `Empresa` é
 * injetado pelo BFF a partir do `codigoEmpresa` persistido (AD-019); o cliente
 * nunca o monta.
 */
export async function validarTicket(
  codigo: string,
  deps: PagamentoQueriesDeps = {},
): Promise<ResultadoTicket> {
  const erpClient = deps.erpClient ?? criarErpClient();

  const resposta = await chamarErp(erpClient, CAMINHO_VALIDA_TICKET, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketDevolucao: codigo }),
  });

  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  const validado = validaTicketDevolucaoOutputSchema.safeParse(await resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('ValidaTicketDevolucao', validado.error.message);
  }

  return interpretarRespostaTicket({
    valorTicket: validado.data.ValorTicket,
    valido: validado.data.Valido,
    mensagem: validado.data.Mensagem,
  });
}
