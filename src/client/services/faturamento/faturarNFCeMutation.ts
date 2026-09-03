/**
 * Envio de `POST /api/erp/FaturarNFCe` (T006).
 *
 * **Sem retry automático em nenhum caso** — nem backoff, nem uma única
 * repetição. A ausência de reenvio é requisito de negócio (`FR-004`, AD-038),
 * não uma lacuna a preencher: reenviar sem saber se o ERP já processou a
 * primeira tentativa é o que arriscaria duplicar a NFCe. O único caminho de
 * reenvio é a ação explícita do operador (`DialogoConfirmarReenvio`).
 *
 * A chamada passa pelo proxy autenticado `/api/erp/*` da feature 002, que
 * injeta `Authorization` e `Empresa` no servidor — o frontend nunca fala com o
 * ERP direto nem monta esses campos.
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { criarErpClient, type ErpClient } from '../erpClient';
import type { CheckoutFaturarNFCe } from '../../domain/venda/montarRetratoVenda';
import { mapearRespostaFaturamento } from './faturarNFCeMapper';
import type { NotaFiscalResposta } from '../../../shared/schemas/faturarNFCe.schema';

const CAMINHO_FATURAR_NFCE = '/ApiCentriumOAuth/FaturarNFCe';

/**
 * Classificação da falha **por origem**, não por conteúdo de mensagem
 * (`research.md`, D2) — é ela que decide se a trava de confirmação manual entra
 * em cena.
 */
export type ResultadoFaturamento =
  | { readonly estado: 'sucesso'; readonly notaFiscal: NotaFiscalResposta | null }
  /** O ERP respondeu (ainda que recusando): a primeira tentativa **não** gerou NFCe. */
  | { readonly estado: 'falha-negocio'; readonly mensagem: string }
  /** Nenhuma resposta chegou: pode ter sido processada do outro lado (AD-038). */
  | { readonly estado: 'falha-rede' };

export interface FaturamentoDeps {
  readonly erpClient?: ErpClient;
}

const MENSAGEM_SESSAO_ENCERRADA =
  'A sessão do operador foi encerrada. Reabra o Checkout pelo ERP e tente novamente.';

function mensagemDeHttp(status: number): string {
  return `O ERP recusou a operação (HTTP ${String(status)}). Nada foi emitido.`;
}

/**
 * Envia o retrato e classifica o desfecho. Função comum (não hook) para o
 * domínio de teste da máquina de estados não precisar montar React.
 */
export async function enviarFaturarNFCe(
  retrato: CheckoutFaturarNFCe,
  deps: FaturamentoDeps = {},
): Promise<ResultadoFaturamento> {
  const cliente = deps.erpClient ?? criarErpClient();

  const resultado = await cliente.chamar(CAMINHO_FATURAR_NFCE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // `FaturarNFCeInput` envelopa o retrato (YAML, linha 819) — o corpo não é o
    // `CheckoutFaturarNFCe` cru.
    body: JSON.stringify({ CheckoutFaturarNFCe: retrato }),
  });

  switch (resultado.estado) {
    case 'erro-de-rede':
      return { estado: 'falha-rede' };

    case 'sessao-encerrada':
      // 401 terminal é **falha de negócio**, não de rede: uma resposta HTTP
      // chegou, então a requisição não foi processada às cegas e não há risco
      // de NFCe duplicada — travar o reenvio aqui seria fricção sem proteção
      // (`research.md`, D2).
      return { estado: 'falha-negocio', mensagem: MENSAGEM_SESSAO_ENCERRADA };

    case 'ok':
      break;
  }

  if (!resultado.resposta.ok) {
    return { estado: 'falha-negocio', mensagem: mensagemDeHttp(resultado.resposta.status) };
  }

  let corpo: unknown;
  try {
    corpo = await resultado.resposta.json();
  } catch {
    // 2xx com corpo ilegível: o ERP respondeu, então vale a mesma regra do 401
    // acima — falha de negócio, sem trava de reenvio.
    return {
      estado: 'falha-negocio',
      mensagem: 'O ERP respondeu em formato ilegível. Nada foi emitido.',
    };
  }

  const mapeado = mapearRespostaFaturamento(retrato.SuspenderOuFaturar, corpo);
  if (mapeado.estado === 'invalida') {
    return { estado: 'falha-negocio', mensagem: mapeado.mensagem };
  }

  return { estado: 'sucesso', notaFiscal: mapeado.notaFiscal };
}

export type MutationFaturamento = UseMutationResult<
  ResultadoFaturamento,
  Error,
  CheckoutFaturarNFCe
>;

/**
 * `retry: false` é explícito e não deve ser removido "para robustez": ver o
 * TSDoc do módulo. `networkMode: 'always'` impede que o TanStack Query pause a
 * mutation quando o navegador se declara offline — o operador precisa ver a
 * falha e decidir, não ficar com um envio pendurado em silêncio.
 */
export function useFaturarNFCe(deps: FaturamentoDeps = {}): MutationFaturamento {
  return useMutation({
    mutationFn: (retrato: CheckoutFaturarNFCe) => enviarFaturarNFCe(retrato, deps),
    retry: false,
    networkMode: 'always',
  });
}
