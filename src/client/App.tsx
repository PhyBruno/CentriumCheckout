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
import { AcoesFinaisVenda } from './features/finalizacao-suspensao/AcoesFinaisVenda';
import { usePollingStatusSistema } from './services/statusSistema/pollingStatusSistema';
import { abrirSessaoDeVenda, useVendaStore } from './stores/vendaStore';

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

  return (
    <TelaDeVenda
      onRecarregarBootstrap={() => {
        void carregar();
      }}
    />
  );
}

/**
 * Breakpoint canônico de MOB-01 (`specs/007-layout-responsivo-mobile/plan.md`):
 * `768px`, expresso como `max-width: 767.98px` para não deixar buraco em telas
 * de largura fracionária.
 *
 * Provisório: a feature 007 substitui isto por `useIsMobile` em
 * `src/client/layout/`, lido por um único `AppShell` que decide entre
 * `DesktopLayout` e `MobileWizard`. O valor é o mesmo de propósito — divergir
 * aqui criaria uma faixa de larguras em que a 003 e a 007 discordariam sobre
 * qual árvore está montada.
 */
const CONSULTA_LAYOUT_COMPACTO = '(max-width: 767.98px)';

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

interface TelaDeVendaProps {
  /**
   * Recarrega `SessaoUsuario` por completo. Passado de cima porque quem sabe
   * carregar o bootstrap é `App` (feature 002) — o polling desta feature só
   * decide **quando** chamar, nunca reimplementa a busca (`research.md`, D6).
   */
  readonly onRecarregarBootstrap: () => void;
}

/**
 * Tela de venda. A configuração do PDV já está inteira carregada aqui (a
 * feature 002 garante isso); o conteúdo é das features de venda — por ora o
 * carrinho (003) e a finalização/suspensão (004), depois pagamento (008).
 *
 * A grid desktop e a lista mobile leem o **mesmo** estado de carrinho; só uma
 * das duas é montada por vez.
 */
function TelaDeVenda({ onRecarregarBootstrap }: TelaDeVendaProps): ReactElement {
  const compacto = useLayoutCompacto();
  const cadMaqCod = useSessionStore((estado) => estado.registro?.SessaoUsuario.CadMaqCod ?? null);
  const linhas = useVendaStore((estado) => estado.linhas);

  // Abre a sessão de venda quando a tela entra em cena, e só se ainda não
  // houver uma aberta: a tela pode remontar no meio de uma venda (recarga do
  // bootstrap, por exemplo), e reabrir a sessão ali apagaria o histórico de
  // auditoria já acumulado (`FR-006`/`FR-008` da feature 001).
  useEffect(() => {
    if (useVendaStore.getState().eventos.length === 0) {
      abrirSessaoDeVenda('NOVA');
    }
  }, []);

  usePollingStatusSistema({
    cadMaqCod: () => cadMaqCod,
    // `FR-013`: nunca durante uma venda em digitação. O segundo termo da guarda
    // ("cliente já identificado") entra com a feature 005 — até lá, o carrinho
    // vazio é a condição completa de "entre vendas" que existe no código.
    vendaAtiva: () => linhas.some((linha) => !linha.cancelada),
    recarregarBootstrap: onRecarregarBootstrap,
  });

  return (
    <main
      className="flex h-screen flex-col gap-base overflow-hidden p-base"
      data-testid="tela-de-venda"
    >
      <header className="flex items-center justify-between gap-sm">
        <h1 className="text-lg font-semibold">Centrium Checkout</h1>
      </header>

      <EntradaRapidaProduto />

      {/* Montagem condicional, não `display: none`. As duas superfícies leem o
          mesmo carrinho; manter as duas árvores no DOM duplicaria cada item
          para leitores de tela. É também o que a 007 exige de forma mais ampla:
          ausência estrutural, não flag de "oculto" (MOB-05, FR-008). */}
      {compacto ? <ListaItensMobile /> : <GridItens />}

      {/* Uma única instância, nos dois layouts: os dois botões e os dois
          diálogos precisam compartilhar a mesma máquina de estados (ver TSDoc
          de `AcoesFinaisVenda`). No Pencil a lixeira mobile aparece na barra
          superior (AD-089); reposicioná-la para lá pertence ao `MobileWizard`
          da feature 007, que é quem passa a possuir o shell mobile — dividir a
          máquina de estados entre dois pontos do DOM agora reabriria o caminho
          de reenvio que `FR-004` fecha. */}
      <footer className="mt-auto w-full self-end sm:max-w-[360px]">
        <AcoesFinaisVenda compacto={compacto} />
      </footer>
    </main>
  );
}
