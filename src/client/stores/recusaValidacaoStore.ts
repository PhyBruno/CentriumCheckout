import { create } from 'zustand';

/**
 * Janela da recusa do gate de validação prévia (AD-239).
 *
 * Store próprio, minúsculo, e não um campo do `vendaStore`: isto é estado de
 * **apresentação** — qual janela está aberta —, e não estado da venda. O
 * `validacaoVendaSlice` guarda o veredito vigente, que é o dado; quem decide
 * mostrar uma janela é a camada de tela, e misturar as duas coisas faria o
 * slice da venda conhecer a UI (`ARCHITECTURE.md`).
 *
 * Existe porque a recusa do ERP virava só um toast por motivo (feature 014): o
 * operador inseria a forma, a lista de pagamentos não mudava e a explicação
 * passava voando — indistinguível de um clique que não pegou. A recusa agora
 * tem a mesma anatomia de janela dos outros desfechos recusados, com a cópia
 * própria (pedido do usuário, 2026-09-16).
 *
 * Os avisos de `ACEITA` e a indisponibilidade do ERP **continuam em toast**: o
 * primeiro acompanha um pagamento que entrou, e o segundo pede só "tente de
 * novo" — nenhum dos dois é a venda sendo recusada.
 */
export interface RecusaValidacaoStore {
  /** Motivos da recusa vigente, ou `null` quando não há janela aberta. */
  readonly motivos: readonly string[] | null;
  /** Abre a janela. Lista vazia é ignorada — janela sem motivo não explica nada. */
  abrirRecusa(motivos: readonly string[]): void;
  fecharRecusa(): void;
}

export const useRecusaValidacaoStore = create<RecusaValidacaoStore>((set) => ({
  motivos: null,
  abrirRecusa: (motivos) => {
    const uteis = motivos.map((texto) => texto.trim()).filter((texto) => texto !== '');
    if (uteis.length === 0) {
      return;
    }
    set({ motivos: uteis });
  },
  fecharRecusa: () => {
    set({ motivos: null });
  },
}));
