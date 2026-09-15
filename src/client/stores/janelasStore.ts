import { create } from 'zustand';

/**
 * Qual janela da tela de venda está aberta (feature 016, T005).
 *
 * **Existe porque um atalho na raiz não alcançava as janelas.** O estado de
 * abertura morava em três componentes-folha — `BotaoMenuImportacao`,
 * `CampoClienteVenda`, `EntradaRapidaProduto` —, abaixo da bifurcação de
 * layout, e as teclas fixas são registradas em `AppShell`, acima dela
 * (`research.md` D4/D5). Mesmo precedente e mesma justificativa de
 * `edicaoItemStore` e `focoVendaStore`: coordenação de UI entre pontos distantes
 * da árvore, sem prop drilling.
 *
 * **Um enum, não booleanos**: as janelas são mutuamente exclusivas, e booleanos
 * independentes permitiriam representar "cliente e produto abertos", que não é
 * estado real. Com a união, `FR-006` — a tecla não abre um segundo modal — é
 * consequência do tipo (invariante I3).
 *
 * **Só a janela, nunca o parâmetro de abertura** (D8): termo sugerido, item em
 * edição e afins continuam no componente que já os mantém. Guardá-los aqui faria
 * deste store um espelho parcial do estado dos modais, com duas fontes para o
 * mesmo dado.
 *
 * Fora do `vendaStore` de propósito: não é estado da venda, não é auditado e
 * não sobrevive a nada. Sem `persist` (Constitution VI) e sem Immer — o estado
 * é um valor só.
 */
export type JanelaAberta =
  'nenhuma' | 'seletor-importacao' | 'dav' | 'nfce' | 'cliente' | 'produto';

export interface JanelasState {
  readonly janela: JanelaAberta;
  /** Sem efeito quando já há janela aberta (I3); idempotente com a mesma. */
  readonly abrir: (janela: Exclude<JanelaAberta, 'nenhuma'>) => void;
  /**
   * Troca a janela sem passar por `'nenhuma'` — é o passo do seletor de
   * importação para a janela escolhida. Os dois são o mesmo gesto, e um quadro
   * sem janela entre eles deixaria o foco cair no documento.
   */
  readonly substituir: (janela: 'dav' | 'nfce') => void;
  readonly fechar: () => void;
}

export const useJanelasStore = create<JanelasState>((set, get) => ({
  janela: 'nenhuma',
  abrir: (janela) => {
    if (get().janela !== 'nenhuma') {
      return;
    }
    set({ janela });
  },
  substituir: (janela) => {
    set({ janela });
  },
  fechar: () => {
    if (get().janela === 'nenhuma') {
      return;
    }
    set({ janela: 'nenhuma' });
  },
}));
