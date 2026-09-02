import { create } from 'zustand';
import type { LinhaCarrinho } from '../domain/precificacao/linha';

/**
 * Coordena "carregar um item já inserido de volta para a barra de entrada
 * rápida" (correção do usuário, 2026-09-03) entre quem dispara (`GridItens`,
 * `ListaItensMobile`) e quem consome (`EntradaRapidaProduto`) — os três são
 * irmãos em `TelaDeVenda` (`App.tsx`), sem relação de pai/filho entre si, e um
 * store minúsculo evita prop drilling por `App.tsx` só para isto.
 *
 * Fica fora do `vendaStore` de propósito: não é estado da venda (não é
 * auditado, não entra em `repricarSku`, não sobrevive a nada) — é só um sinal
 * efêmero de UI, do mesmo jeito que `resolvido`/`buscaAberta` já são estado
 * local de componente. Sem `persist`, mesma razão do `vendaStore` (AD-006).
 */
export interface EdicaoItemState {
  readonly linhaEmEdicao: LinhaCarrinho | null;
  carregarParaEdicao(linha: LinhaCarrinho): void;
  limparEdicao(): void;
}

export const useEdicaoItemStore = create<EdicaoItemState>((set) => ({
  linhaEmEdicao: null,
  carregarParaEdicao: (linha) => {
    set({ linhaEmEdicao: linha });
  },
  limparEdicao: () => {
    set({ linhaEmEdicao: null });
  },
}));
