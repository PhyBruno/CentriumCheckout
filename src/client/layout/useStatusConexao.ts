import { useSyncExternalStore } from 'react';

/**
 * Indicador "Online" da barra superior (nó `swUNN` do Pencil).
 *
 * A fonte é `navigator.onLine` + os eventos `online`/`offline` do navegador —
 * o único sinal contínuo de conectividade que o Checkout tem. O polling de
 * `GetStatusSistema` **não** serve aqui: ele roda só entre vendas e existe
 * para detectar mudança de configuração, não queda de rede
 * (`pollingStatusSistema.ts`, `FR-013`/AD-088).
 *
 * `useSyncExternalStore` em vez de `useState` + `useEffect`: o valor vive fora
 * do React e pode mudar entre a renderização e a montagem: assinar por fora é
 * o que evita a barra nascer "Online" num PDV que já estava sem rede.
 */
export function useStatusConexao(): boolean {
  return useSyncExternalStore(assinar, lerOnline, () => true);
}

function assinar(aoMudar: () => void): () => void {
  window.addEventListener('online', aoMudar);
  window.addEventListener('offline', aoMudar);

  return () => {
    window.removeEventListener('online', aoMudar);
    window.removeEventListener('offline', aoMudar);
  };
}

function lerOnline(): boolean {
  // `navigator.onLine` é `false` só quando o SO garante que não há rede; um
  // navegador que não implemente a propriedade é tratado como online, que é o
  // default do padrão.
  return navigator.onLine !== false;
}
