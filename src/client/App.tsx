import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react';
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
import { PainelMensagem } from './features/session-bootstrap/PainelMensagem';

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
  const { estado, mensagemErro, itensNaVenda } = useSessionStore(
    useShallow((s) => ({
      estado: s.estado,
      mensagemErro: s.mensagemErro,
      itensNaVenda: s.itensNaVenda,
    })),
  );

  const repositorioEfetivo = useMemo(
    () => repositorio ?? criarRepositorioBootstrap(bootstrapDb),
    [repositorio],
  );

  const analisadorRef = useRef<AnalisadorBootstrap | null>(null);

  const carregar = useCallback(async (): Promise<void> => {
    const { iniciarCarregamento, concluir, falhar, encerrarSessao } = useSessionStore.getState();
    iniciarCarregamento();

    analisadorRef.current ??= criarAnalisador();

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
    }
  }, [criarAnalisador, leitorCarrinho, repositorioEfetivo]);

  useEffect(() => {
    void carregar();

    return () => {
      analisadorRef.current?.encerrar();
      analisadorRef.current = null;
    };
  }, [carregar]);

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
      <PainelMensagem
        titulo="Sessão encerrada"
        texto="Reabra o Checkout a partir do ERP para continuar."
      />
    );
  }

  if (estado === 'erro-recuperavel') {
    return (
      <ErrorRetry
        mensagem={mensagemErro ?? 'Falha ao carregar a configuração do ponto de venda.'}
        onTentarNovamente={() => {
          void carregar();
        }}
      />
    );
  }

  if (!telaDeVendaLiberada(estado)) {
    return <LoadingSkeleton />;
  }

  return <TelaDeVenda />;
}

/**
 * Espaço da tela de venda. O conteúdo real vem das features de carrinho,
 * pagamento e finalização — esta feature só garante que ela é liberada com a
 * configuração do PDV inteira já carregada.
 */
function TelaDeVenda(): ReactElement {
  return (
    <main data-testid="tela-de-venda">
      <h1>Centrium Checkout</h1>
      <p>Ponto de venda pronto para operação.</p>
    </main>
  );
}
