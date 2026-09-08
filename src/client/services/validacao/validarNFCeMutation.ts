/**
 * Envio de `POST /api/erp/ValidarNFCe` (T005,
 * `specs/014-validacao-previa-nfce/contracts/erp-validacao-api.md`).
 *
 * **Mutation, não query** (`research.md` D10): a consulta é disparada por gesto
 * do operador, não por render, e o seu resultado vale para **aquela** venda
 * naquele instante. Cache ou `refetch` reaproveitariam um veredito obtido para
 * uma venda diferente — que é exatamente o que `FR-001a`/I2a proíbem.
 *
 * **Sem retry automático** (`research.md` D5, `retry: 0`): a nova tentativa é
 * sempre gesto do operador. Repetir sozinho esconderia do caixa que o ERP está
 * fora, e faria o gate demorar o dobro para dizer "não deu".
 *
 * **Nunca rejeita a promise** (I4): timeout, rede, HTTP de erro e corpo fora do
 * schema viram `INDISPONIVEL` com a causa. É o que permite ao call site tratar
 * indisponibilidade como recusa sem `try/catch` — e um `catch` esquecido em
 * algum ponto não pode virar aprovação tácita.
 *
 * A chamada passa pelo proxy autenticado `/api/erp/*` da feature 002, que injeta
 * `Authorization` e `Empresa` no servidor.
 */

import { criarErpClient, type ErpClient } from '../erpClient';
import {
  interpretarRespostaValidacao,
  vereditoDeFalha,
  type Veredito,
} from '../../domain/validacaoVenda/interpretarVeredito';
import type { CheckoutFaturarNFCe } from '../../domain/venda/montarRetratoVenda';
import { validarNFCeOutputSchema } from '../../../shared/schemas/validarNFCe.schema';

const CAMINHO_VALIDAR_NFCE = '/ApiCentriumOAuth/ValidarNFCe';

/**
 * Teto de espera do gate, em milissegundos.
 *
 * Existe porque `SC-006` exige desfecho visível em menos de 2s e o `fetch` não
 * tem timeout próprio: sem ele, uma rede que não responde deixaria o operador
 * com o botão travado indefinidamente, sem recusa nem aceite. Folga acima dos
 * 2s de propósito — cortar exatamente no alvo transformaria uma resposta lenta
 * porém válida em indisponibilidade.
 */
export const TIMEOUT_VALIDACAO_MS = 8_000;

export interface ValidacaoDepsRede {
  readonly erpClient?: ErpClient;
  readonly timeoutMs?: number;
}

/**
 * Envia o retrato e devolve o veredito. Função comum (não hook) porque quem a
 * consome é o `validacaoVendaSlice`, que é Zustand puro e não pode montar React
 * — mesmo padrão de `enviarFaturarNFCe` (004) e `validarTicket` (008).
 */
export async function enviarValidarNFCe(
  retrato: CheckoutFaturarNFCe,
  deps: ValidacaoDepsRede = {},
): Promise<Veredito> {
  const cliente = deps.erpClient ?? criarErpClient();
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_VALIDACAO_MS;

  const controlador = new AbortController();
  // Flag própria, e não inspeção do erro: `criarErpClient` já traduz qualquer
  // exceção do `fetch` para `erro-de-rede`, então sem esta marca o timeout
  // chegaria ao operador como falha de rede — duas causas distintas com a mesma
  // frase, e nenhuma pista de que o ERP está apenas lento.
  let expirou = false;
  const temporizador = setTimeout(() => {
    expirou = true;
    controlador.abort();
  }, timeoutMs);

  try {
    const resultado = await cliente.chamar(CAMINHO_VALIDAR_NFCE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `ValidarNFCeInput` envelopa o retrato, como `FaturarNFCeInput` — o corpo
      // não é o `CheckoutFaturarNFCe` cru.
      body: JSON.stringify({ CheckoutFaturarNFCe: retrato }),
      signal: controlador.signal,
    });

    switch (resultado.estado) {
      case 'erro-de-rede':
        return vereditoDeFalha(expirou ? 'TIMEOUT' : 'REDE');

      case 'sessao-encerrada':
        // 401 terminal: a feature 002 já derruba a sessão por conta própria a
        // partir do proxy. Aqui só interessa que **nada** foi validado — tratar
        // como aceite deixaria a venda passar no exato momento em que o operador
        // perdeu a credencial.
        return vereditoDeFalha('SERVIDOR');

      case 'ok':
        break;
    }

    if (!resultado.resposta.ok) {
      return vereditoDeFalha('SERVIDOR');
    }

    let corpo: unknown;
    try {
      corpo = await resultado.resposta.json();
    } catch {
      return vereditoDeFalha('RESPOSTA_INVALIDA');
    }

    const validado = validarNFCeOutputSchema.safeParse(corpo);
    if (!validado.success) {
      // Inclui o caso de `Valido` ausente (o schema não lhe dá default): resposta
      // truncada é indisponibilidade, nunca aceite presumido.
      return vereditoDeFalha('RESPOSTA_INVALIDA');
    }

    return interpretarRespostaValidacao(validado.data);
  } finally {
    clearTimeout(temporizador);
  }
}

/*
 * **Não existe hook de mutation aqui, e isto é decisão** (revisão da 014,
 * 2026-09-08). A versão inicial exportava um `useValidarNFCe` que ninguém
 * chamava: quem consome esta função é o `validacaoVendaSlice`, que é Zustand
 * puro e não monta React.
 *
 * Um hook exportado e não usado seria pior do que código morto comum — seria um
 * **segundo caminho de consulta** ao gate, e um caminho que não passaria pela
 * guarda `emValidacao` (`FR-011`/I8) nem gravaria `vereditoVigente`. Alguém o
 * chamaria por parecer o jeito idiomático, e a venda passaria a ser validada
 * por fora do slice que existe para ser o ponto único.
 *
 * `enviarValidarNFCe` já é a superfície completa: sem cache, sem retry, sem
 * refetch — exatamente o que `research.md` D10 pede.
 */
