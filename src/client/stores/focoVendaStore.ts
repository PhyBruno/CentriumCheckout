import { create } from 'zustand';

/**
 * Pedido de foco no campo de código de produto, entre irmãos da tela de venda.
 *
 * Mesmo padrão e mesma justificativa do `edicaoItemStore`: quem dispara
 * (`CampoClienteVenda`, ao identificar o cliente) e quem consome
 * (`EntradaRapidaProduto`, dono do `input`) não têm relação de pai/filho — são
 * irmãos em `TelaDeVenda` (`App.tsx`) —, e um store minúsculo evita prop
 * drilling por `App.tsx` só para isto.
 *
 * Fica fora do `vendaStore` de propósito: não é estado da venda (não é
 * auditado, não entra em `repricarSku`, não sobrevive a nada) — é só um sinal
 * efêmero de UI. Sem `persist`, mesma razão do `vendaStore` (AD-006).
 */
export interface FocoVendaState {
  /**
   * Contador de pedidos, não um booleano: dois pedidos seguidos precisam
   * disparar o efeito duas vezes. Um `boolean` ficaria `true` no primeiro e não
   * mudaria no segundo — o React não reexecutaria o efeito, e o foco não
   * voltaria na segunda identificação seguida.
   */
  readonly pedidosDeFocoNoCodigo: number;
  /**
   * Devolve o foco ao campo de código de produto.
   *
   * Chamado depois de toda identificação de cliente bem-sucedida (pedido do
   * usuário, 2026-09-03): o operador identifica o cliente e segue direto para
   * bipar o próximo item, sem tocar no mouse.
   */
  focarCodigoProduto(): void;
}

export const useFocoVendaStore = create<FocoVendaState>((set) => ({
  pedidosDeFocoNoCodigo: 0,
  focarCodigoProduto: () => {
    set((estado) => ({ pedidosDeFocoNoCodigo: estado.pedidosDeFocoNoCodigo + 1 }));
  },
}));
