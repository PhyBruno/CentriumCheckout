import { useMemo } from 'react';
import type { CondicaoPagamento } from '../../domain/pagamento/formaPagamento';
import { parsearCenarios } from '../../domain/vendaRapida/parsearCenarios';
import { projetarAtalhos } from '../../domain/vendaRapida/projetarAtalhos';
import type { ListaAtalhos } from '../../domain/vendaRapida/tipos';
import { usePlataforma } from '../../layout/usePlataforma';
import { useCondicoesPagamento } from '../../services/pagamento/pagamentoQueries';
import { useSessionStore } from '../../stores/sessionStore';

/**
 * A `ListaAtalhos` da sessão (feature 013) — derivada, memoizada e imutável
 * enquanto a sessão durar (D7).
 *
 * **Fora do `vendaStore` de propósito**: o catálogo de cenários é projeção do
 * bootstrap, não estado da venda. Guardá-lo no store faria um dado do PDV
 * nascer e morrer junto com o carrinho, e o `zustand-immer-state` da base
 * reserva o store para o que a venda de fato acumula.
 *
 * As duas origens são as mesmas que a tela de pagamento já usa, e nenhuma
 * chamada nova ao ERP é introduzida:
 *
 * - `SessaoUsuario.CenarioPagamento` vem do `sessionStore` (bootstrap da 002);
 * - o catálogo de condições/formas vem de `useCondicoesPagamento` (008), a
 *   query com `staleTime` de 30 min exigida por `PAY-01` — ler o catálogo do
 *   `sessionStore` aqui criaria uma segunda fonte de verdade para a mesma
 *   informação, capaz de divergir da que o seletor de condição mostra.
 */

/**
 * O catálogo de condições da sessão, ou lista vazia enquanto a query não
 * resolveu. Exportado porque o comando de acionamento precisa da **mesma**
 * lista para resolver `selecionarCondicao(codigo)` no objeto que o slice espera.
 */
export function useCatalogoDeCondicoes(): readonly CondicaoPagamento[] {
  const { data } = useCondicoesPagamento();
  return data?.condicoes ?? [];
}

export function useAtalhosVendaRapida(): ListaAtalhos {
  const campoCenarios = useSessionStore(
    (estado) => estado.registro?.SessaoUsuario.CenarioPagamento ?? null,
  );
  const condicoes = useCatalogoDeCondicoes();
  const plataforma = usePlataforma();

  return useMemo(
    () => projetarAtalhos(parsearCenarios(campoCenarios), condicoes, plataforma),
    [campoCenarios, condicoes, plataforma],
  );
}
