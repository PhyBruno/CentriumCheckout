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
import { PainelMensagem } from './features/session-bootstrap/PainelMensagem';
import { EntradaRapidaProduto } from './features/carrinho/EntradaRapidaProduto';
import { GridItens } from './features/carrinho/GridItens';
import { ListaItensMobile } from './features/carrinho/ListaItensMobile';
import { ModalBuscaProduto } from './features/carrinho/ModalBuscaProduto';
import { Button } from '@/components/ui/button';

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

  /**
   * Há um `carregar()` em andamento.
   *
   * Não dá para derivar de `estado`: quando `ErrorRetry` está na tela o estado
   * já é `'erro-recuperavel'`, então o botão precisa do próprio flag para não
   * disparar dois carregamentos concorrentes no duplo clique.
   */
  const [carregando, setCarregando] = useState(false);

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

  return <TelaDeVenda />;
}

/** Limiar `md` do Tailwind — o layout condicional definitivo é da feature 007. */
const CONSULTA_LAYOUT_COMPACTO = '(max-width: 767px)';

function useLayoutCompacto(): boolean {
  const [compacto, setCompacto] = useState(
    () => window.matchMedia(CONSULTA_LAYOUT_COMPACTO).matches,
  );

  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA_LAYOUT_COMPACTO);
    const aoMudar = (evento: MediaQueryListEvent): void => {
      setCompacto(evento.matches);
    };

    // Reavalia na montagem: a largura pode ter mudado entre o estado inicial e
    // o efeito (o próprio E2E redimensiona a janela antes de navegar).
    setCompacto(consulta.matches);
    consulta.addEventListener('change', aoMudar);
    return () => {
      consulta.removeEventListener('change', aoMudar);
    };
  }, []);

  return compacto;
}

/**
 * Tela de venda. A configuração do PDV já está inteira carregada aqui (a
 * feature 002 garante isso); o conteúdo é das features de venda — por ora o
 * carrinho (003), depois pagamento (008) e finalização (004).
 *
 * A grid desktop e a lista mobile leem o **mesmo** estado de carrinho; só uma
 * das duas é montada por vez.
 */
function TelaDeVenda(): ReactElement {
  const [buscaAberta, setBuscaAberta] = useState(false);
  const compacto = useLayoutCompacto();

  return (
    <main className="flex min-h-screen flex-col gap-base p-base" data-testid="tela-de-venda">
      <header className="flex items-center justify-between gap-sm">
        <h1 className="text-lg font-semibold">Centrium Checkout</h1>
        <Button
          type="button"
          variant="outline"
          data-testid="abrir-busca-produto"
          onClick={() => {
            setBuscaAberta(true);
          }}
        >
          Buscar produto
        </Button>
      </header>

      <EntradaRapidaProduto />

      {/* Montagem condicional, não `display: none`: as duas superfícies leem o
          mesmo carrinho, e manter as duas árvores no DOM duplicaria cada item
          para leitores de tela. */}
      {compacto ? <ListaItensMobile /> : <GridItens />}

      <ModalBuscaProduto
        aberto={buscaAberta}
        onFechar={() => {
          setBuscaAberta(false);
        }}
      />
    </main>
  );
}
