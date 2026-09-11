import { create } from 'zustand';

/**
 * Pedidos de foco entre irmãos da tela de venda: do card de cliente para o
 * campo de código de produto, dali de volta ao documento do cliente e, desde
 * 2026-09-10, dali para o campo do vendedor.
 *
 * Mesmo padrão e mesma justificativa do `edicaoItemStore`: quem dispara
 * (`CampoClienteVenda`, ao identificar o cliente; `EntradaRapidaProduto`, ao
 * receber Shift+TAB ou ao recusar a inserção por falta de vendedor) e quem
 * consome (o outro card, dono do `input`) não têm
 * relação de pai/filho — são irmãos em `TelaDeVenda` (`App.tsx`) —, e um store
 * minúsculo evita prop drilling por `App.tsx` só para isto.
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
  /**
   * Contador de pedidos de foco no campo de identificação do cliente — mesma
   * razão de ser um número, e não um booleano, que `pedidosDeFocoNoCodigo`.
   */
  readonly pedidosDeFocoNoDocumento: number;
  /**
   * Leva o foco ao campo "Código do cliente ou CPF", **expandindo o card se
   * ele estiver recolhido**.
   *
   * Chamado pelo Shift+TAB no campo de código de produto (pedido do usuário,
   * 2026-09-04): voltar dali levava ao botão "Recolhido" do cabeçalho, um
   * controle de layout, quando o passo anterior do fluxo do caixa é a
   * identificação do cliente. Quem expande é o próprio `CampoClienteVenda` —
   * o estado de expansão é dele, e o campo é `inert` enquanto recolhido.
   */
  focarDocumentoCliente(): void;
  /**
   * Contador de pedidos de foco no campo do vendedor — mesma razão de ser um
   * número que os dois acima: bipar dois produtos seguidos numa venda sem
   * vendedor precisa levar o foco lá as duas vezes.
   */
  readonly pedidosDeFocoNoVendedor: number;
  /**
   * Leva o foco ao campo "Vendedor NFCe" — na prática, à lupa que abre
   * `ModalBuscaVendedor`, o único controle focável do par (pedido do usuário,
   * 2026-09-10).
   *
   * Chamado pela barra de entrada rápida quando o operador tenta inserir um
   * produto numa venda sem vendedor: a inserção é recusada com o motivo, e o
   * foco vai para o gesto que resolve — Enter na lupa abre o modal.
   *
   * **Foca, não abre.** Abrir o modal daqui deixaria um leitor de código de
   * barras — que dispara uma tecla por caractere, e cada bipagem é uma
   * tentativa de inserção — reabrindo a janela em rajada por cima do próprio
   * operador. Com o foco na lupa, quem decide abrir continua sendo ele.
   */
  focarVendedor(): void;
}

export const useFocoVendaStore = create<FocoVendaState>((set) => ({
  pedidosDeFocoNoCodigo: 0,
  focarCodigoProduto: () => {
    set((estado) => ({ pedidosDeFocoNoCodigo: estado.pedidosDeFocoNoCodigo + 1 }));
  },
  pedidosDeFocoNoDocumento: 0,
  focarDocumentoCliente: () => {
    set((estado) => ({ pedidosDeFocoNoDocumento: estado.pedidosDeFocoNoDocumento + 1 }));
  },
  pedidosDeFocoNoVendedor: 0,
  focarVendedor: () => {
    set((estado) => ({ pedidosDeFocoNoVendedor: estado.pedidosDeFocoNoVendedor + 1 }));
  },
}));
