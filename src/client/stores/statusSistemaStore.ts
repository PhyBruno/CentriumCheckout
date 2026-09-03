import { create } from 'zustand';

/**
 * Último valor lido de `GetStatusSistema` (T027/`FR-013`).
 *
 * Store mínimo e separado do `sessionStore`: o polling escreve, a barra
 * superior lê, e nenhum dos dois precisa conhecer o outro. Sem `persist` —
 * um valor de status colhido na sessão anterior não diz nada sobre o estado
 * atual da máquina, e mostrá-lo depois de um F5 seria pior que "Verificando…".
 */
export interface StatusSistemaState {
  /** `null` enquanto não houve nenhuma leitura bem-sucedida. */
  readonly ultimoStatus: number | null;
  registrarStatus(valor: number): void;
}

export const useStatusSistemaStore = create<StatusSistemaState>()((set) => ({
  ultimoStatus: null,
  registrarStatus: (valor) => {
    set({ ultimoStatus: valor });
  },
}));

/** Ponte não-React para o polling, que roda fora de qualquer componente. */
export function registrarStatusSistema(valor: number): void {
  useStatusSistemaStore.getState().registrarStatus(valor);
}
