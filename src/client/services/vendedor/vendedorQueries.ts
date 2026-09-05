/**
 * Camada de rede do único endpoint de vendedor (T012,
 * `contracts/erp-vendedor-api.md`).
 *
 * A chamada passa pelo proxy autenticado `/api/erp/*` da feature 002 — o
 * frontend nunca fala com o host do ERP direto nem manipula `access_token`, e
 * `Authorization`/`Empresa` são injetados no servidor.
 *
 * Nenhum parâmetro de status/`Ativo` é enviado: `GetListaVendedores` aceita
 * somente `Empresa`, `Txtbusca`, `Pagina` e `Tamanhopagina` (AD-103).
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  getListaVendedoresOutputSchema,
  type CheckoutListaVendedores,
} from '../../../shared/schemas/vendedor.schema';
import { criarErpClient, type ErpClient } from '../erpClient';
import { ErroRedeErp, ErroRespostaInvalida, ErroSessaoEncerrada } from '../errosErp';

const CAMINHO_GET_LISTA_VENDEDORES = '/ApiCentriumOAuth/GetListaVendedores';

const PAGINA_INICIAL = 1;
const TAMANHO_PAGINA_PADRAO = 20;

export interface VendedorQueriesDeps {
  readonly erpClient?: ErpClient;
}

export interface ParametrosBuscaVendedores {
  /** `SessaoUsuario.QtdMinCharParaConsulta` — piso do ERP, nunca hardcoded (AD-024). */
  readonly qtdMinCharParaConsulta: number;
  readonly pagina?: number;
  readonly tamanhoPagina?: number;
}

export async function fetchListaVendedores(
  termo: string,
  parametros: ParametrosBuscaVendedores,
  deps: VendedorQueriesDeps = {},
): Promise<CheckoutListaVendedores> {
  const erpClient = deps.erpClient ?? criarErpClient();
  const query = new URLSearchParams({
    Txtbusca: termo,
    Pagina: String(parametros.pagina ?? PAGINA_INICIAL),
    Tamanhopagina: String(parametros.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO),
  });

  const resultado = await erpClient.chamar(`${CAMINHO_GET_LISTA_VENDEDORES}?${query.toString()}`, {
    method: 'GET',
  });

  switch (resultado.estado) {
    case 'erro-de-rede':
      throw new ErroRedeErp();
    case 'sessao-encerrada':
      throw new ErroSessaoEncerrada();
    case 'ok':
      break;
  }

  if (!resultado.resposta.ok) {
    throw new ErroRedeErp();
  }

  const validado = getListaVendedoresOutputSchema.safeParse(await resultado.resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('GetListaVendedores', validado.error.message);
  }

  return validado.data;
}

/**
 * Busca por termo livre para o modal (`VEND-01`/`VEND-02`).
 *
 * `staleTime: 0` — como a busca de cliente, e ao contrário do produto
 * (`staleTime: Infinity`, que garante preço estável durante a venda): o
 * resultado não alimenta cálculo nenhum, é lista de escolha, e vale a mais
 * recente. O piso de caracteres entra pelo `enabled`, não por um `if` dentro do
 * `queryFn`, para o TanStack Query nem agendar a requisição.
 */
export function useBuscaVendedores(
  termo: string,
  parametros: ParametrosBuscaVendedores,
  deps: VendedorQueriesDeps = {},
): UseQueryResult<CheckoutListaVendedores, Error> {
  const termoLimpo = termo.trim();
  const pagina = parametros.pagina ?? PAGINA_INICIAL;

  return useQuery({
    queryKey: ['busca-vendedores', termoLimpo, pagina] as const,
    queryFn: () => fetchListaVendedores(termoLimpo, parametros, deps),
    enabled: termoLimpo.length >= parametros.qtdMinCharParaConsulta,
    staleTime: 0,
  });
}
