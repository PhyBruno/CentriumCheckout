import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  bootstrapDb,
  criarRepositorioBootstrap,
  type RepositorioBootstrap,
} from './db/bootstrapDb';
import {
  carregarBootstrap,
  criarAnalisadorViaWorker,
  type AnalisadorBootstrap,
} from './services/bootstrapClient';
import { leitorCarrinhoVazio, type LeitorCarrinho } from './services/erpClient';
import { useSessionStore, telaDeVendaLiberada } from './stores/sessionStore';
import { LoadingSkeleton } from './features/session-bootstrap/LoadingSkeleton';
import { ErrorRetry } from './features/session-bootstrap/ErrorRetry';
import { SessionExpiredWarning } from './features/session-bootstrap/SessionExpiredWarning';
import { AcessoInvalido } from './features/session-bootstrap/AcessoInvalido';
import { COOKIE_ENTRADA, PARAM_ERRO_ACESSO, VALOR_COOKIE_ENTRADA } from '../shared/erroAcesso';
import { AppShell } from './layout/AppShell';

/**
 * O BFF recusou o redirect de entrada e mandou o navegador para `/?erro=sessao`
 * (ver `src/shared/erroAcesso.ts`). Lido uma única vez, na montagem: é uma
 * condição da URL de chegada, não um estado que muda durante a venda.
 */
function acessoRecusadoNaEntrada(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).has(PARAM_ERRO_ACESSO);
}

/**
 * Houve uma entrada válida pelo CentriumWEB nesta origem?
 *
 * É o que separa as duas falhas (pedido do usuário, 2026-09-08): "Tentar
 * novamente" só faz sentido quando os dados **foram** mandados e algo falhou
 * depois — ERP fora, rede caindo, resposta inválida. Quem abriu o Checkout
 * direto, ou chegou por um redirect sem os parâmetros, não tem o que repetir:
 * a mesma tentativa daria o mesmo resultado para sempre, e o botão só
 * convidaria o operador a insistir.
 *
 * O marcador é o cookie legível gravado pelo BFF no único ponto em que uma
 * sessão nasce, e apagado em toda recusa de entrada. Lido do `document.cookie`
 * a cada avaliação, e não memoizado, porque a sessão pode nascer ou ser
 * recusada entre uma tentativa e outra.
 */
function houveEntradaValida(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  return document.cookie
    .split(';')
    .some((parte) => parte.trim().startsWith(`${COOKIE_ENTRADA}=${VALOR_COOKIE_ENTRADA}`));
}

export interface AppProps {
  /** Injetáveis para teste — em produção usam os padrões reais. */
  readonly repositorio?: RepositorioBootstrap;
  readonly criarAnalisador?: () => AnalisadorBootstrap;
  /** Fornecido pela feature 001/003 quando a venda em andamento existir. */
  readonly leitorCarrinho?: LeitorCarrinho;
}

/**
 * Orquestra o bootstrap da sessão (T027, US2).
 *
 * A tela de venda só é liberada depois que o Dexie confirma a gravação (ou que
 * o registro já estava lá): nunca aparece parcialmente configurada
 * (FR-003/SC-002).
 */
export function App({
  repositorio,
  criarAnalisador = criarAnalisadorViaWorker,
  leitorCarrinho = leitorCarrinhoVazio,
}: AppProps = {}): ReactElement {
  // `mensagemErro` continua no store (é o registro da causa técnica), mas não é
  // lido aqui: a tela de falha mostra uma única mensagem, sempre a mesma.
  const { estado, itensNaVenda } = useSessionStore(
    useShallow((s) => ({
      estado: s.estado,
      itensNaVenda: s.itensNaVenda,
    })),
  );

  const repositorioEfetivo = useMemo(
    () => repositorio ?? criarRepositorioBootstrap(bootstrapDb),
    [repositorio],
  );

  const analisadorRef = useRef<AnalisadorBootstrap | null>(null);

  /**
   * Há um `carregar()` em andamento.
   *
   * Não dá para derivar de `estado`: quando `ErrorRetry` está na tela o estado
   * já é `'erro-recuperavel'`, então o botão precisa do próprio flag para não
   * disparar dois carregamentos concorrentes no duplo clique.
   */
  const [carregando, setCarregando] = useState(false);

  const acessoRecusado = useMemo(acessoRecusadoNaEntrada, []);

  const carregar = useCallback(async (): Promise<void> => {
    const { iniciarCarregamento, concluir, falhar, encerrarSessao } = useSessionStore.getState();
    iniciarCarregamento();
    setCarregando(true);

    analisadorRef.current ??= criarAnalisador();

    try {
      const resultado = await carregarBootstrap({
        repositorio: repositorioEfetivo,
        analisador: analisadorRef.current,
      });

      switch (resultado.estado) {
        case 'pronto':
          concluir(resultado.registro, resultado.reaproveitado);
          return;
        case 'sessao-encerrada':
          encerrarSessao(leitorCarrinho.quantidadeDeItens());
          return;
        case 'erro-recuperavel':
          falhar(resultado.mensagem);
          return;
        case 'cancelado':
          // O componente está desmontando: não há estado de UI a atualizar.
          return;
      }
    } finally {
      setCarregando(false);
    }
  }, [criarAnalisador, leitorCarrinho, repositorioEfetivo]);

  useEffect(() => {
    // Sem dados de acesso válidos não há o que carregar: chamar `/api/bootstrap`
    // aqui só trocaria o painel terminal por um 401 e a mesma tela no fim.
    if (acessoRecusado) {
      return;
    }

    void carregar();

    return () => {
      analisadorRef.current?.encerrar();
      analisadorRef.current = null;
    };
  }, [acessoRecusado, carregar]);

  if (acessoRecusado) {
    return <AcessoInvalido />;
  }

  if (estado === 'sessao-encerrada') {
    // Com venda em digitação, avisa antes de encerrar (FR-006); com carrinho
    // vazio, encerra direto pedindo para reabrir pelo ERP.
    return itensNaVenda > 0 ? (
      <SessionExpiredWarning
        itensNaVenda={itensNaVenda}
        onEncerrar={() => {
          window.location.assign('/');
        }}
      />
    ) : (
      // Carrinho vazio: nada a perder e nada a repetir daqui — o operador
      // precisa de um novo redirect do CentriumWEB, e é o que o painel diz.
      <AcessoInvalido />
    );
  }

  if (estado === 'erro-recuperavel') {
    // "Recuperável" descreve a **falha** (não foi um 401), não a situação do
    // operador. Sem entrada válida não há sessão para carregar, então repetir
    // devolveria o mesmo erro indefinidamente: aqui o desfecho é o mesmo de
    // quem chegou sem os parâmetros — reabrir pelo CentriumWEB.
    if (!houveEntradaValida()) {
      return <AcessoInvalido />;
    }

    return (
      <ErrorRetry
        tentando={carregando}
        onTentarNovamente={() => {
          void carregar();
        }}
      />
    );
  }

  if (!telaDeVendaLiberada(estado)) {
    return <LoadingSkeleton />;
  }

  /**
   * A partir daqui a tela de venda é responsabilidade do `AppShell` (feature
   * 007): a configuração do PDV já está inteira carregada (a 002 garante isso)
   * e é ele quem decide entre a tela única do desktop e o wizard mobile.
   *
   * O que morava inline aqui — a composição de duas colunas e os dois `if
   * (compacto)` que alternavam grid/lista e as faixas de ação — mudou para
   * `layout/desktop/DesktopLayout.tsx` e `layout/mobile/`.
   */
  return (
    <AppShell
      onRecarregarBootstrap={() => {
        void carregar();
      }}
    />
  );
}
