import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { criarAuditoriaSlice } from './slices/auditoriaSlice';
import type { AuditoriaSlice } from './slices/auditoriaSlice';

/**
 * Store da venda em andamento — **sem `persist`** (AD-006, Constitution VI):
 * o carrinho e tudo que o acompanha morrem num F5, por decisão de arquitetura,
 * não por esquecimento.
 *
 * Montado pelo padrão de slices do Zustand para ficar aberto à extensão sem
 * alteração (Open/Closed): cada feature de venda acrescenta o seu slice à
 * interseção de `VendaState` e o seu slice creator ao spread abaixo — carrinho
 * (003), finalização (004), cliente (005), pagamento (008), vendedor (012).
 * Por ora só o slice de auditoria (001) existe.
 */
export type VendaState = AuditoriaSlice;

export const useVendaStore = create<VendaState>()(
  immer((...args) => ({
    ...criarAuditoriaSlice(...args),
  })),
);
