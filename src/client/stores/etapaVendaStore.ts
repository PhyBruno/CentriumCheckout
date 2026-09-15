import { create } from 'zustand';

/**
 * Pedidos de etapa para o wizard mobile, vindos de quem não sabe que ele existe
 * (feature 016, pendência 55).
 *
 * O caso é a venda rápida: F6–F9 acionam no compacto desde a 016, e o comando
 * (`useAcionarCenario`) precisa de duas navegações que só fazem sentido lá —
 * a etapa de pagamento **antes** de lançar, porque a janela do PIX só existe
 * nela, e a revisão **ao fim**, para a venda que continuou aberta chegar ao
 * "Finalizar" (correção do usuário, 2026-09-15). O comando é de `features/` e
 * não pode ler layout (`semDuplicacaoRegra.spec.ts`); então ele só **pede**, e
 * quem decide entrar é o `MobileWizard`, pela mesma regra dos botões. No
 * desktop ninguém observa, e o pedido não tem efeito.
 *
 * Contadores, e não booleanos, pelo mesmo motivo do `focoVendaStore`: dois
 * acionamentos seguidos precisam produzir duas navegações.
 *
 * Fora do `vendaStore` de propósito: não é estado da venda, não é auditado e não
 * sobrevive a nada. Sem `persist` (Constitution VI).
 */
export interface EtapaVendaState {
  readonly pedidosDePagamento: number;
  readonly pedidosDeRevisao: number;
  pedirPagamento(): void;
  pedirRevisao(): void;
}

export const useEtapaVendaStore = create<EtapaVendaState>((set) => ({
  pedidosDePagamento: 0,
  pedidosDeRevisao: 0,
  pedirPagamento: () => {
    set((estado) => ({ pedidosDePagamento: estado.pedidosDePagamento + 1 }));
  },
  pedirRevisao: () => {
    set((estado) => ({ pedidosDeRevisao: estado.pedidosDeRevisao + 1 }));
  },
}));
