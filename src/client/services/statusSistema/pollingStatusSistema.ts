import { useEffect } from 'react';
import { z } from 'zod';
import { registrarStatusSistema } from '../../stores/statusSistemaStore';
import { criarErpClient, type ErpClient } from '../erpClient';

/**
 * Polling de `GET /api/erp/GetStatusSistema` (T027, `FR-013`, AD-088).
 *
 * Mecanismo secundário, sem relação com o envio da venda: verifica, **só entre
 * vendas**, se a configuração publicada em `GetSessao` mudou. Vive nesta
 * feature porque é onde a spec formal posicionou o requisito, não por afinidade
 * de domínio (`research.md`, D6).
 *
 * `Empresa` não é montado aqui: o BFF o injeta como header em toda chamada
 * `/api/erp/*` (AD-019/AD-118). O cliente só envia `Cadmaqcod`.
 */

const CAMINHO_STATUS_SISTEMA = '/ApiCentriumOAuth/GetStatusSistema';

/** 60 segundos (AD-088) — a única atividade periódica desta feature. */
export const INTERVALO_STATUS_SISTEMA_MS = 60_000;

/**
 * A resposta é um inteiro puro, sem wrapper (`contracts/status-sistema-api.md`).
 * Validado na fronteira mesmo sendo escalar: um corpo inesperado aqui não pode
 * virar `NaN >= 1` e disparar um rebootstrap do nada (Constitution IV).
 */
const statusSistemaSchema = z.number().int();

export interface StatusSistemaDeps {
  readonly erpClient?: ErpClient;
  /** `SessaoUsuario.CadMaqCod`; `null` enquanto o bootstrap não carregou. */
  readonly cadMaqCod: () => string | null;
  /**
   * Venda em digitação: carrinho com pelo menos 1 item **ou** cliente já
   * identificado (features 003 e 005). Lido, nunca mutado.
   */
  readonly vendaAtiva: () => boolean;
  /** `refetchBootstrap()` da feature 002 — recarrega `SessaoUsuario` inteiro. */
  readonly recarregarBootstrap: () => void;
  /**
   * Publica cada leitura bem-sucedida. O default alimenta o store que a barra
   * superior lê para mostrar "Online"/"Contingência" — injetável para os
   * testes não dependerem de estado global.
   */
  readonly aoLerStatus?: (valor: number) => void;
  readonly intervaloMs?: number;
}

/** `null` = nada a decidir (rede, sessão encerrada ou corpo inesperado). */
export async function consultarStatusSistema(
  cadMaqCod: string,
  deps: Pick<StatusSistemaDeps, 'erpClient'> = {},
): Promise<number | null> {
  const cliente = deps.erpClient ?? criarErpClient();
  const query = new URLSearchParams({ Cadmaqcod: cadMaqCod });

  const resultado = await cliente.chamar(`${CAMINHO_STATUS_SISTEMA}?${query.toString()}`, {
    method: 'GET',
  });

  // Falha de rede aqui não é evento: o ciclo simplesmente tenta de novo daqui a
  // 60s. Diferente de `FaturarNFCe`, isto não é operação crítica e não deve
  // produzir estado de erro visível ao operador
  // (`contracts/status-sistema-api.md`, § Erros).
  if (resultado.estado !== 'ok' || !resultado.resposta.ok) {
    return null;
  }

  let corpo: unknown;
  try {
    corpo = await resultado.resposta.json();
  } catch {
    return null;
  }

  const validado = statusSistemaSchema.safeParse(corpo);
  return validado.success ? validado.data : null;
}

/**
 * Liga o polling enquanto **não** há venda em andamento.
 *
 * O intervalo é criado e destruído conforme a guarda, em vez de rodar sempre e
 * ignorar o tick durante a venda: uma chamada supérflua a cada 60s no meio de
 * uma venda ativa continuaria consumindo rede e sessão sem nenhum uso
 * (`data-model.md` §6, "Suspenso — intervalo pausado, não só ignorado").
 */
export function usePollingStatusSistema(deps: StatusSistemaDeps): void {
  const { cadMaqCod, vendaAtiva, recarregarBootstrap, erpClient } = deps;
  const intervaloMs = deps.intervaloMs ?? INTERVALO_STATUS_SISTEMA_MS;
  const aoLerStatus = deps.aoLerStatus ?? registrarStatusSistema;

  const codigo = cadMaqCod();
  const ativo = codigo !== null && !vendaAtiva();

  useEffect(() => {
    if (!ativo || codigo === null) {
      return;
    }

    let cancelado = false;

    const ciclo = async (): Promise<void> => {
      const status = await consultarStatusSistema(
        codigo,
        erpClient === undefined ? {} : { erpClient },
      );
      if (cancelado || status === null) {
        return;
      }

      // O mesmo valor responde às duas perguntas: se a máquina segue emitindo
      // NFCe normalmente (o que a barra superior mostra) e se a configuração
      // publicada em `GetSessao` mudou.
      aoLerStatus(status);

      // `0` = nada mudou. Qualquer valor `>= 1` significa "algo mudou"; o
      // significado específico acima de 1 não importa para esta decisão binária
      // (AD-075/AD-080/AD-088).
      if (status >= 1) {
        recarregarBootstrap();
      }
    };

    // Uma leitura imediata ao entrar em "entre vendas", antes do primeiro
    // intervalo: sem ela o operador ficaria até 60s sem saber se o PDV está
    // emitindo online ou em contingência, que é justamente o que o indicador
    // da barra superior existe para responder.
    void ciclo();

    const temporizador = setInterval(() => {
      void ciclo();
    }, intervaloMs);

    return () => {
      cancelado = true;
      clearInterval(temporizador);
    };
  }, [ativo, aoLerStatus, codigo, erpClient, intervaloMs, recarregarBootstrap]);
}
