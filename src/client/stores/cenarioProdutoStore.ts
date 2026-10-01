import { create } from 'zustand';

/**
 * Janela do produto recusado por cenário tributário (AD-258).
 *
 * Store próprio pelo mesmo motivo de `recusaValidacaoStore`: é estado de
 * **apresentação** — qual janela está aberta —, e quem decide abrir é a
 * inserção de produto (`useCarrinho.ts`), longe de quem desenha a janela (o
 * provider de diálogos, que vale para os dois layouts).
 *
 * Janela, e não toast (pedido do usuário, 2026-10-01): o produto **não entra**,
 * e a explicação do ERP tem duas linhas — o toast passaria voando e o
 * operador repetiria a bipagem achando que não pegou.
 */
export interface RecusaPorCenario {
  /** Descrição do produto recusado, para a janela dizer qual foi. */
  readonly descricaoProduto: string;
  /** O que o ERP escreveu em `messages`; pode vir vazio. */
  readonly motivos: readonly string[];
}

export interface CenarioProdutoStore {
  readonly recusa: RecusaPorCenario | null;
  abrirRecusaPorCenario(recusa: RecusaPorCenario): void;
  fecharRecusaPorCenario(): void;
}

export const useCenarioProdutoStore = create<CenarioProdutoStore>((set) => ({
  recusa: null,
  abrirRecusaPorCenario: (recusa) => {
    set({
      recusa: {
        descricaoProduto: recusa.descricaoProduto,
        motivos: recusa.motivos.map((texto) => texto.trim()).filter((texto) => texto !== ''),
      },
    });
  },
  fecharRecusaPorCenario: () => {
    set({ recusa: null });
  },
}));
