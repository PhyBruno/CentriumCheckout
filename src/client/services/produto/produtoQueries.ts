/**
 * Camada de rede dos endpoints de produto (T006, T014, T040).
 *
 * Todas as chamadas passam pelo proxy autenticado `/api/erp/*` da feature 002 —
 * o frontend nunca fala com o ERP direto nem manipula `access_token`, e
 * `Empresa`/`Authorization` são injetados no servidor.
 */

import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  getListaProdutosOutputSchema,
  getProdutoOutputSchema,
  type CheckoutListaProdutos,
} from '../../../shared/schemas/produto.schema';
import type { SnapshotPrecoProduto } from '../../domain/precificacao/linha';
import { criarErpClient, type ErpClient } from '../erpClient';
import { ErroRedeErp, ErroRespostaInvalida, ErroSessaoEncerrada } from '../errosErp';
import { paraSnapshotPrecoProduto } from './produtoMapper';

const CAMINHO_GET_PRODUTO = '/ApiCentriumOAuth/GetProduto';
const CAMINHO_GET_LISTA_PRODUTOS = '/ApiCentriumOAuth/GetListaProdutos';

/** `TipoPreco` em que a lista de preço do cliente entra na chamada (AD-092). */
const TIPO_PRECO_POR_LISTA = 9;

/** Raiz da chave de cache — a invalidação de fim de venda opera sobre ela. */
export const CHAVE_RAIZ_PRODUTO = ['produto'] as const;

const HTTP_NAO_ENCONTRADO = 404;

/**
 * Contexto de precificação da sessão/venda, aplicado a **toda** chamada de
 * `GetProduto`. Vem do bootstrap (feature 002) e do cliente atual (feature 005).
 */
export interface ContextoPrecificacao {
  /** `SessaoUsuario.UsuarioTipoCodigoProduto` — sempre este, nunca inferido (AD-033). */
  readonly tipoCodProduto: string;
  /** `SessaoUsuario.TipoPreco`. */
  readonly tipoPreco: number;
  /** Cliente atual da venda, inclusive o default (AD-032). */
  readonly codigoCliente: number;
  /**
   * Lista de preço do cliente. Só é enviada quando `tipoPreco = 9`; não existe
   * lista padrão da empresa e não há fallback (AD-092/AD-108).
   */
  readonly listaPreco: number | null;
}

export interface ProdutoQueriesDeps {
  readonly erpClient?: ErpClient;
}

export class ErroProdutoNaoEncontrado extends Error {
  constructor(readonly codigoProduto: string) {
    super(`Produto ${codigoProduto} não encontrado.`);
    this.name = 'ErroProdutoNaoEncontrado';
  }
}

/**
 * Erros de transporte: declarados em `services/errosErp.ts` desde a feature
 * 005, que passou a precisar dos mesmos no serviço de cliente. Reexportados
 * daqui porque `useCarrinho.ts` e os testes da 003 já os importam deste módulo
 * — e porque duas classes homônimas em módulos diferentes quebrariam os
 * `instanceof` que decidem a mensagem ao operador.
 */
export {
  ErroRedeErp,
  ErroRespostaInvalida,
  ErroSessaoEncerrada,
} from '../errosErp';

/**
 * `listaPreco` faz parte da chave porque, em `TipoPreco = 9`, trocar o cliente
 * muda o preço do mesmo código (`FR-018`, AD-043) — sem isso o cache devolveria
 * o preço do cliente anterior (`research.md`, D5).
 */
export function chaveProduto(
  codigoProduto: string,
  contexto: ContextoPrecificacao,
): readonly unknown[] {
  return [
    ...CHAVE_RAIZ_PRODUTO,
    codigoProduto,
    contexto.tipoCodProduto,
    contexto.tipoPreco,
    contexto.listaPreco ?? null,
  ];
}

function parametrosDeProduto(
  codigoProduto: string,
  contexto: ContextoPrecificacao,
): URLSearchParams {
  const parametros = new URLSearchParams({
    Codigoproduto: codigoProduto,
    Tipocodproduto: contexto.tipoCodProduto,
    Tipopreco: String(contexto.tipoPreco),
    Codcliente: String(contexto.codigoCliente),
  });

  // Para `TipoPreco ≠ 9` o parâmetro é **omitido**, não enviado vazio (AD-092).
  if (contexto.tipoPreco === TIPO_PRECO_POR_LISTA && contexto.listaPreco !== null) {
    parametros.set('Listapreco', String(contexto.listaPreco));
  }

  return parametros;
}

async function chamarErp(
  cliente: ErpClient,
  caminho: string,
  parametros: URLSearchParams,
): Promise<Response> {
  const resultado = await cliente.chamar(`${caminho}?${parametros.toString()}`, { method: 'GET' });

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
 * Resolve o produto e devolve o snapshot pronto para virar linha.
 *
 * Chamado em **todos** os caminhos de inserção — código bipado, digitado,
 * `codigo*quantidade`, código de balança e seleção no modal de busca (AD-091).
 */
export async function fetchProduto(
  codigoProduto: string,
  contexto: ContextoPrecificacao,
  deps: ProdutoQueriesDeps = {},
): Promise<SnapshotPrecoProduto> {
  const cliente = deps.erpClient ?? criarErpClient();
  const resposta = await chamarErp(
    cliente,
    CAMINHO_GET_PRODUTO,
    parametrosDeProduto(codigoProduto, contexto),
  );

  if (resposta.status === HTTP_NAO_ENCONTRADO) {
    throw new ErroProdutoNaoEncontrado(codigoProduto);
  }
  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  const validado = getProdutoOutputSchema.safeParse(await resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('GetProduto', validado.error.message);
  }

  return paraSnapshotPrecoProduto(validado.data.Produto);
}

/**
 * Opções de `useQuery`/`fetchQuery` para um produto.
 *
 * `staleTime: Infinity` durante toda a venda é o que garante `CART-03`
 * (reinserir o mesmo SKU não gera chamada) e, mais importante, impede que o
 * mesmo SKU rebuscado no meio da venda produza linhas de tabelas divergentes. A
 * única fronteira de frescor é o fim da venda (`invalidarCacheDeProduto`).
 */
export function opcoesProduto(
  codigoProduto: string,
  contexto: ContextoPrecificacao,
  deps: ProdutoQueriesDeps = {},
) {
  return {
    queryKey: chaveProduto(codigoProduto, contexto),
    queryFn: () => fetchProduto(codigoProduto, contexto, deps),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  } as const;
}

export interface ParametrosBusca {
  /** `SessaoUsuario.QtdMinCharParaConsulta` — piso vem do ERP, nunca hardcoded (AD-024). */
  readonly qtdMinCharParaConsulta: number;
  readonly pagina?: number;
  readonly tamanhoPagina?: number;
}

const PAGINA_INICIAL = 1;
const TAMANHO_PAGINA_PADRAO = 20;

export async function fetchListaProdutos(
  termo: string,
  parametros: ParametrosBusca,
  deps: ProdutoQueriesDeps = {},
): Promise<CheckoutListaProdutos> {
  const cliente = deps.erpClient ?? criarErpClient();
  const query = new URLSearchParams({
    Txtbusca: termo,
    Pagina: String(parametros.pagina ?? PAGINA_INICIAL),
    Tamanhopagina: String(parametros.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO),
  });

  const resposta = await chamarErp(cliente, CAMINHO_GET_LISTA_PRODUTOS, query);
  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  const validado = getListaProdutosOutputSchema.safeParse(await resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('GetListaProdutos', validado.error.message);
  }

  return validado.data.ListaProdutos;
}

/**
 * Busca por termo livre para o modal (`CART-01`).
 *
 * Termo abaixo de `QtdMinCharParaConsulta` **não dispara chamada** — o guard é o
 * `enabled`, não um `if` dentro do `queryFn`, para que o TanStack Query nem
 * agende a requisição.
 */
export function useBuscaProdutos(
  termo: string,
  parametros: ParametrosBusca,
  deps: ProdutoQueriesDeps = {},
): UseQueryResult<CheckoutListaProdutos, Error> {
  const termoLimpo = termo.trim();
  const pagina = parametros.pagina ?? PAGINA_INICIAL;

  return useQuery({
    queryKey: ['busca-produtos', termoLimpo, pagina] as const,
    queryFn: () => fetchListaProdutos(termoLimpo, parametros, deps),
    enabled: termoLimpo.length >= parametros.qtdMinCharParaConsulta,
  });
}

/**
 * Descarta o cache de produto inteiro.
 *
 * Chamado em exatamente dois momentos e só neles: finalização e suspensão da
 * venda (`research.md`, D5). Fora deles, `staleTime: Infinity` precisa valer.
 */
export function invalidarCacheDeProduto(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: CHAVE_RAIZ_PRODUTO });
}
