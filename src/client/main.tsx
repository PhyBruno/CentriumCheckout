import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GooeyToaster } from 'goey-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
// Bones gerados por `npm run bones` (CLI do Boneyard). Sem este import,
// `<Skeleton name="pdv-venda">` não acha a geometria capturada e cai no
// `fallback` estático — sem shimmer nenhum (AUTH-05).
import './bones/registry';
import './styles/global.css';
// Obrigatório uma única vez no entry, senão os toasts saem sem estilo.
import 'goey-toast/styles.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Elemento #root não encontrado em index.html');
}

/**
 * Cache do ERP durante a venda (feature 003).
 *
 * Não há retry automático: no ritmo de um PDV, uma tentativa silenciosa que
 * atrasa a resposta é pior que um erro imediato que o operador refaz bipando de
 * novo. O `staleTime` de produto é definido por query (`Infinity` durante a
 * venda, `CART-03`), não aqui.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
    {/* Montado uma única vez perto da raiz — as features de venda, pagamento e
        finalização disparam toasts por `gooeyToast` sem remontar nada.

        Canto superior direito: no rodapé da tela ficam o atalho de cancelar e o
        botão de finalizar, então um toast embaixo à direita cobria justamente a
        ação que o operador acabou de tentar (pedido do usuário, 2026-09-02). */}
    <GooeyToaster position="top-right" />
  </StrictMode>,
);
