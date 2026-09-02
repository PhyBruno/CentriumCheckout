import type { StateCreator } from 'zustand';
import type { VendaState } from '../vendaStore';
import { eventoVendaIniciada } from '../../domain/auditoria/eventos';
import type {
  EventoAuditoria,
  EventoAuditoriaRegistravel,
  EventoAuditoriaSemTimestamp,
  HistoricoAuditoriaVenda,
  OrigemVenda,
} from '../../domain/auditoria/eventos';

/**
 * Slice de auditoria da venda em andamento (feature 001).
 *
 * Combinado no `vendaStore` (Zustand+Immer, **sem `persist`**) para ter o
 * mesmo ciclo de vida do carrinho (AD-006/research.md #1): resetar ou
 * descartar a venda e a auditoria acontece atomicamente, sem sincronizar dois
 * stores. Nada aqui sobrevive a um F5 nem é gravado em Dexie/localStorage
 * (Constitution VI).
 *
 * Responsabilidade única (Constitution II): acumular eventos já normalizados e
 * carimbar o `timestamp`. Nenhuma regra de negócio de cliente/vendedor/produto/
 * pagamento mora aqui — quem decide *quando* disparar é a feature de origem.
 */
export interface AuditoriaSlice {
  /** Histórico da sessão atual, em ordem de ocorrência. */
  readonly eventos: HistoricoAuditoriaVenda;

  /**
   * Registra um evento ao final do histórico, carimbando o `timestamp` no
   * momento do `push` — o call site nunca fornece a data/hora.
   *
   * Aceita `EventoAuditoriaRegistravel`, não a união inteira: `VENDA_INICIADA`
   * é excluído em tempo de compilação porque só `resetarAuditoria` pode
   * produzi-lo (ver TSDoc de `EventoAuditoriaRegistravel` em `eventos.ts`).
   */
  registrarEventoAuditoria(evento: EventoAuditoriaRegistravel): void;

  /**
   * Zera o histórico e já registra `VENDA_INICIADA`. Chamado uma única vez no
   * início/retomada de uma sessão de venda, nunca no meio de uma venda em
   * andamento — é o que garante que uma sessão nunca herde eventos da anterior
   * (FR-008/SC-003).
   */
  resetarAuditoria(origem: OrigemVenda): void;

  /**
   * Esvazia o histórico **sem** registrar evento. Só pode ser chamado depois
   * de `FaturarNFCe` retornar sucesso (FR-007) — uma falha de rede jamais
   * chama isto, senão os eventos da tentativa perdida sumiriam (FR-006/SC-002).
   */
  descartarAuditoria(): void;
}

/** `timestamp` autoritativo do slice — nunca vem do call site. */
function carimbar(evento: EventoAuditoriaSemTimestamp): EventoAuditoria {
  return { ...evento, timestamp: new Date().toISOString() };
}

export const criarAuditoriaSlice: StateCreator<
  VendaState,
  [['zustand/immer', never]],
  [],
  AuditoriaSlice
> = (set) => ({
  eventos: [],

  registrarEventoAuditoria: (evento) =>
    set((state) => {
      if (state.eventos.length === 0 && import.meta.env.DEV) {
        // Histórico vazio no momento do registro: `resetarAuditoria` deveria
        // ter sido chamado antes para abrir a sessão com `VENDA_INICIADA`
        // como primeiro evento (FR-002). Não lança exceção — perder o
        // primeiro evento de auditoria é ruim, mas derrubar a venda do
        // operador de caixa por causa disso é pior.
        console.warn(
          '[auditoria] registrarEventoAuditoria foi chamado com o histórico vazio — ' +
            'resetarAuditoria deveria ter sido chamado antes para abrir a sessão de ' +
            'venda com VENDA_INICIADA como primeiro evento (FR-002).',
        );
      }
      state.eventos.push(carimbar(evento));
    }),

  resetarAuditoria: (origem) =>
    set((state) => {
      state.eventos = [carimbar(eventoVendaIniciada({ origem }))];
    }),

  descartarAuditoria: () =>
    set((state) => {
      state.eventos = [];
    }),
});
