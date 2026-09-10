import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GooeyToaster } from 'goey-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ROTA_DISPLAY } from '../shared/display';
import { DisplayCliente } from './features/display/DisplayCliente';
import { sincronizarLayoutNoDocumento } from './layout/sincronizarLayoutNoDocumento';
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

// Antes de qualquer render: o `md:` do `global.css` lê `<html data-layout>`
// (AD-198), e sem o atributo até a tela de carregamento sairia vestida de
// mobile num desktop. Síncrono, então nada chega a ser pintado com o veredito
// errado.
sincronizarLayoutNoDocumento();

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

/**
 * A tela do cliente (feature 015) monta **fora** de `App`, `AppShell` e dos
 * providers — e isso não é preferência de estilo (research D9).
 *
 * O `AppShell` chama `abrirSessaoDeVenda('NOVA')` na montagem, registra o
 * `beforeunload` de `useAvisoAoSair` e liga o polling de `GetStatusSistema`. Uma
 * segunda aba dentro dele abriria uma sessão de auditoria e um polling extra
 * para uma tela que não vende nada, que é exatamente o que FR-016 proíbe. O
 * `QueryClientProvider` é dispensável porque o display não faz rede (FR-014), e
 * o `GooeyToaster` porque toast é conversa com o operador, não com o cliente.
 *
 * Ramificar por `pathname` basta: `/display` não colide com nenhuma rota do BFF
 * e sobrevive a um F5 pelo `setNotFoundHandler` do Fastify em produção e pelo
 * fallback de SPA do Vite em desenvolvimento (research D12, FR-023).
 */
if (window.location.pathname === ROTA_DISPLAY) {
  createRoot(container).render(
    <StrictMode>
      <DisplayCliente />
    </StrictMode>,
  );
} else {
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
      {/* Montado uma única vez perto da raiz — as features de venda, pagamento
          e finalização disparam toasts por `gooeyToast` sem remontar nada.

          Canto superior direito: no rodapé da tela ficam o atalho de cancelar e
          o botão de finalizar, então um toast embaixo à direita cobria
          justamente a ação que o operador acabou de tentar (pedido do usuário,
          2026-09-02). */}
      <GooeyToaster position="top-right" />
    </StrictMode>,
  );
}
