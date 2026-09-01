import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { RegistroBootstrap } from '../db/bootstrapDb';

/**
 * Estado efêmero do bootstrap da sessão (T024, `data-model.md`).
 *
 * Store **sem `persist`**, deliberadamente separado de qualquer estado de
 * venda: nada aqui deve sobreviver a um F5 (Constitution VI e Regra 2 de
 * `zustand-immer-state` — estado de UI efêmero mora em store próprio, nunca
 * misturado a um `partialize`).
 */

export type EstadoSessao =
  /** Chamada a `/api/bootstrap` em curso — skeleton visível (AUTH-05). */
  | 'carregando'
  /** Gravado no Dexie, tela de venda liberada. */
  | 'pronto'
  /** F5 sem mudança de hash — nada foi rebaixado nem regravado (FR-008). */
  | 'reaproveitado'
  /** Falha não-401 — tela "Tentar novamente" (AUTH-07). */
  | 'erro-recuperavel'
  /** Renovação de sessão falhou — reabrir pelo ERP (AUTH-06). */
  | 'sessao-encerrada';

export interface SessionState {
  readonly estado: EstadoSessao;
  readonly registro: RegistroBootstrap | null;
  readonly mensagemErro: string | null;
  /**
   * Itens na venda em digitação no momento em que a sessão foi encerrada —
   * decide entre avisar antes (FR-006) e encerrar direto. Lido de
   * `vendaStore.ts` (feature 001/003), nunca alterado por esta feature.
   */
  readonly itensNaVenda: number;

  iniciarCarregamento(): void;
  concluir(registro: RegistroBootstrap, reaproveitado: boolean): void;
  falhar(mensagem: string): void;
  encerrarSessao(itensNaVenda: number): void;
}

const ESTADO_INICIAL = {
  estado: 'carregando' as EstadoSessao,
  registro: null as RegistroBootstrap | null,
  mensagemErro: null as string | null,
  itensNaVenda: 0,
};

export const useSessionStore = create<SessionState>()(
  immer((set) => ({
    ...ESTADO_INICIAL,

    iniciarCarregamento: () =>
      set((state) => {
        state.estado = 'carregando';
        state.mensagemErro = null;
      }),

    concluir: (registro, reaproveitado) =>
      set((state) => {
        state.estado = reaproveitado ? 'reaproveitado' : 'pronto';
        state.registro = registro;
        state.mensagemErro = null;
      }),

    falhar: (mensagem) =>
      set((state) => {
        state.estado = 'erro-recuperavel';
        state.mensagemErro = mensagem;
      }),

    encerrarSessao: (itensNaVenda) =>
      set((state) => {
        state.estado = 'sessao-encerrada';
        state.registro = null;
        state.itensNaVenda = itensNaVenda;
      }),
  })),
);

/**
 * A tela de venda só é liberada depois que o Dexie confirma a gravação (ou que
 * o registro já estava lá) — nunca com configuração parcial (FR-003/SC-002).
 */
export function telaDeVendaLiberada(estado: EstadoSessao): boolean {
  return estado === 'pronto' || estado === 'reaproveitado';
}
